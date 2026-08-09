/**
 * Client-side risk classifier for Cloud Drift Detector changes.
 *
 * Given a change (ADD / REMOVE / MODIFY) and — for MODIFY — the before/after
 * property payloads, return one of:
 *
 *   RISKY   — Someone's estate got materially less secure or an important
 *             resource disappeared. Show first, review immediately.
 *   NOTABLE — Real change but not obviously dangerous (SKU changed, size
 *             changed, region changed). Worth a look.
 *   BENIGN  — Cosmetic or expected (tag change, provisioningState churn,
 *             new resource of a non-sensitive type).
 *
 * All rules are pure — no Azure calls, no network, no state. Runs during
 * diff rendering.
 */

export type DriftRisk = "RISKY" | "NOTABLE" | "BENIGN";

export type DriftChange = "ADD" | "REMOVE" | "MODIFY";

export type ResourceType =
  | "Resource Group"
  | "Virtual Machine"
  | "Disk"
  | "NSG"
  | "Public IP"
  | "Storage Account"
  | "App Service";

export interface RiskAssessment {
  risk: DriftRisk;
  reason: string;
}

const CRITICAL_PORTS = new Set([
  "22",
  "3389",
  "1433",
  "3306",
  "5432",
  "27017",
  "6379",
  "9200",
  "*",
]);

const INTERNET_SOURCES = new Set(["*", "0.0.0.0/0", "Internet", "any"]);

/**
 * Best-effort deep-get from an ARM resource payload. Given the property
 * paths ARM uses inconsistently, we try both direct and `properties.xxx`
 * for each dotted key.
 */
function get(obj: unknown, path: string): unknown {
  if (!obj || typeof obj !== "object") return undefined;
  const parts = path.split(".");
  let cursor: unknown = obj;
  for (const key of parts) {
    if (cursor && typeof cursor === "object" && key in (cursor as Record<string, unknown>)) {
      cursor = (cursor as Record<string, unknown>)[key];
    } else {
      return undefined;
    }
  }
  return cursor;
}

function transitioned(before: unknown, after: unknown, path: string, badValue: unknown): boolean {
  const b = get(before, path);
  const a = get(after, path);
  return b !== badValue && a === badValue;
}

/** Did a value decrease (used for e.g. TLS version downgrades)? */
function decreased(before: unknown, after: unknown, path: string): boolean {
  const b = String(get(before, path) ?? "");
  const a = String(get(after, path) ?? "");
  if (!b || !a || b === a) return false;
  // Semver-like compare on the trailing numeric portion.
  const num = (s: string) => Number(s.replace(/[^\d.]/g, "")) || 0;
  return num(a) < num(b);
}

/** Return every NSG rule that opens a critical port to the Internet. */
function riskyRulesOn(nsg: unknown): Array<{ name: string; port: string; source: string }> {
  const rules = get(nsg, "properties.securityRules");
  if (!Array.isArray(rules)) return [];
  const risky: Array<{ name: string; port: string; source: string }> = [];
  for (const r of rules) {
    const p = (r as { properties?: Record<string, unknown> }).properties ?? {};
    const dir = String(p.direction ?? "");
    const access = String(p.access ?? "");
    const src = String(p.sourceAddressPrefix ?? "");
    const port = String(p.destinationPortRange ?? "");
    if (
      dir === "Inbound" &&
      access === "Allow" &&
      INTERNET_SOURCES.has(src) &&
      CRITICAL_PORTS.has(port)
    ) {
      risky.push({ name: String((r as { name?: string }).name ?? ""), port, source: src });
    }
  }
  return risky;
}

/**
 * Classify a drift row. `before` and `after` are the raw ARM payloads
 * for the resource (only meaningful for MODIFY; may be undefined for
 * ADD / REMOVE).
 */
export function classifyChange(
  change: DriftChange,
  type: ResourceType,
  before: unknown,
  after: unknown,
): RiskAssessment {
  // -- REMOVE --
  if (change === "REMOVE") {
    if (type === "NSG") {
      return {
        risk: "RISKY",
        reason: "NSG removed — a network guardrail was deleted.",
      };
    }
    if (type === "Public IP") {
      return {
        risk: "BENIGN",
        reason: "Public IP released — usually a cost / cleanup action.",
      };
    }
    return {
      risk: "NOTABLE",
      reason: `${type} deleted since baseline.`,
    };
  }

  // -- ADD --
  if (change === "ADD") {
    if (type === "NSG") {
      // A brand-new NSG may already contain risky rules — inspect.
      const risky = riskyRulesOn(after);
      if (risky.length > 0) {
        const sample = risky[0];
        return {
          risk: "RISKY",
          reason: `New NSG exposes port ${sample.port} to ${sample.source} in "${sample.name}".`,
        };
      }
      return { risk: "NOTABLE", reason: "New NSG created." };
    }
    if (type === "Storage Account") {
      const publicBlob = get(after, "properties.allowBlobPublicAccess") === true;
      const noHttps = get(after, "properties.supportsHttpsTrafficOnly") === false;
      if (publicBlob || noHttps) {
        return {
          risk: "RISKY",
          reason: `New storage account allows ${publicBlob ? "public blob access" : "insecure HTTP"}.`,
        };
      }
      return { risk: "NOTABLE", reason: "New storage account created." };
    }
    if (type === "Public IP") {
      return {
        risk: "NOTABLE",
        reason: "New public IP allocated — check what resource it will front.",
      };
    }
    return {
      risk: "NOTABLE",
      reason: `New ${type} added since baseline.`,
    };
  }

  // -- MODIFY --
  if (change === "MODIFY") {
    if (type === "Storage Account") {
      if (transitioned(before, after, "properties.allowBlobPublicAccess", true)) {
        return {
          risk: "RISKY",
          reason: "Blob public access was enabled on this storage account.",
        };
      }
      if (transitioned(before, after, "properties.supportsHttpsTrafficOnly", false)) {
        return {
          risk: "RISKY",
          reason: "HTTPS-only was disabled — storage now accepts plain HTTP.",
        };
      }
      if (decreased(before, after, "properties.minimumTlsVersion")) {
        return {
          risk: "RISKY",
          reason: `Minimum TLS version decreased (${get(before, "properties.minimumTlsVersion")} → ${get(after, "properties.minimumTlsVersion")}).`,
        };
      }
      if (
        get(before, "properties.networkAcls.defaultAction") === "Deny" &&
        get(after, "properties.networkAcls.defaultAction") === "Allow"
      ) {
        return {
          risk: "RISKY",
          reason: "Storage network default-action changed from Deny to Allow.",
        };
      }
      if (get(before, "sku.name") !== get(after, "sku.name")) {
        return {
          risk: "NOTABLE",
          reason: `Storage SKU changed (${get(before, "sku.name")} → ${get(after, "sku.name")}).`,
        };
      }
    }

    if (type === "NSG") {
      const wasRisky = new Set(riskyRulesOn(before).map((r) => r.name));
      const nowRisky = riskyRulesOn(after);
      const newlyRisky = nowRisky.filter((r) => !wasRisky.has(r.name));
      if (newlyRisky.length > 0) {
        const s = newlyRisky[0];
        return {
          risk: "RISKY",
          reason: `New rule opens port ${s.port} to ${s.source} ("${s.name}").`,
        };
      }
      // Number of rules changed — worth flagging.
      const before_count = (get(before, "properties.securityRules") as unknown[] | undefined)?.length ?? 0;
      const after_count = (get(after, "properties.securityRules") as unknown[] | undefined)?.length ?? 0;
      if (before_count !== after_count) {
        return {
          risk: "NOTABLE",
          reason: `Rule count changed (${before_count} → ${after_count}).`,
        };
      }
    }

    if (type === "Virtual Machine") {
      const bSize = get(before, "properties.hardwareProfile.vmSize");
      const aSize = get(after, "properties.hardwareProfile.vmSize");
      if (bSize !== aSize) {
        return {
          risk: "NOTABLE",
          reason: `VM size changed (${bSize} → ${aSize}).`,
        };
      }
    }

    if (type === "Public IP") {
      const bIp = get(before, "properties.ipAddress");
      const aIp = get(after, "properties.ipAddress");
      if (bIp !== aIp && aIp) {
        return {
          risk: "NOTABLE",
          reason: `IP address rotated (${bIp ?? "-"} → ${aIp}).`,
        };
      }
    }

    if (type === "App Service") {
      if (transitioned(before, after, "properties.httpsOnly", false)) {
        return {
          risk: "RISKY",
          reason: "App Service HTTPS-only was disabled.",
        };
      }
    }

    // Generic property change — if all we see is tags / provisioningState,
    // classify benign. Otherwise, notable.
    const b = (before ?? {}) as Record<string, unknown>;
    const a = (after ?? {}) as Record<string, unknown>;
    const changedKeys = new Set<string>();
    for (const k of new Set([...Object.keys(b), ...Object.keys(a)])) {
      if (JSON.stringify(b[k]) !== JSON.stringify(a[k])) changedKeys.add(k);
    }
    const cosmeticOnly = [...changedKeys].every((k) =>
      ["tags", "provisioningState", "etag", "systemData", "identity"].includes(k),
    );
    if (cosmeticOnly) {
      return {
        risk: "BENIGN",
        reason: "Only tags / provisioning state changed.",
      };
    }
    return {
      risk: "NOTABLE",
      reason: "Resource properties changed.",
    };
  }

  return { risk: "BENIGN", reason: "No classification rule matched." };
}

/** Sort weight so RISKY floats to the top of the diff table. */
export function riskWeight(r: DriftRisk): number {
  if (r === "RISKY") return 3;
  if (r === "NOTABLE") return 2;
  return 1;
}
