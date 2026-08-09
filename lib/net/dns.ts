/**
 * Dangling-DNS / subdomain-takeover detection.
 *
 * Cross-references DNS records (public + private zones) against live
 * resources. A record that points at a released public IP, a deleted App
 * Service hostname, or a missing resource is a subdomain-takeover risk —
 * an attacker can claim the dangling target and serve content on your name.
 *
 * Pure reference-integrity join over already-fetched zones + resources.
 * No writes.
 */

export interface DnsRecordLite {
  zone: string;
  name: string; // record set name, e.g. "app" (relative) or "@"
  type: "A" | "CNAME" | "AAAA" | string;
  /** For A/AAAA: the IPs. For CNAME: the target hostname. */
  targets: string[];
}

export interface LiveTargets {
  /** Set of public IP addresses currently allocated in the tenant. */
  liveIps: Set<string>;
  /** Set of live hostnames (app service default hostnames, PIP FQDNs, etc.). */
  liveHostnames: Set<string>;
}

export type DnsRisk = "takeover-risk" | "unresolved-cname" | "ok";

export interface DnsFinding {
  fqdn: string;
  type: string;
  target: string;
  risk: DnsRisk;
  detail: string;
}

function lc(s: string): string {
  return (s ?? "").toLowerCase().replace(/\.$/, "");
}

/**
 * Detect dangling records. `azureCnameSuffixes` lists the Azure service
 * domains we treat as "owned by Azure and claimable if unregistered"
 * (azurewebsites.net, cloudapp.azure.com, blob.core.windows.net, etc.).
 */
export function detectDanglingDns(
  records: DnsRecordLite[],
  live: LiveTargets,
  azureCnameSuffixes: string[] = [
    "azurewebsites.net",
    "cloudapp.azure.com",
    "cloudapp.net",
    "trafficmanager.net",
    "blob.core.windows.net",
    "azureedge.net",
    "azurecontainer.io",
    "azurefd.net",
  ],
): DnsFinding[] {
  const liveIps = new Set([...live.liveIps].map(lc));
  const liveHosts = new Set([...live.liveHostnames].map(lc));

  const findings: DnsFinding[] = [];

  for (const rec of records) {
    const fqdn = rec.name === "@" ? rec.zone : `${rec.name}.${rec.zone}`;
    for (const raw of rec.targets) {
      const target = lc(raw);

      if (rec.type === "A" || rec.type === "AAAA") {
        // A record → is this IP still allocated in the tenant?
        if (!liveIps.has(target)) {
          findings.push({
            fqdn,
            type: rec.type,
            target: raw,
            risk: "takeover-risk",
            detail: `Points to IP ${raw}, which is not an allocated public IP in this tenant. If it was released, someone else can claim it.`,
          });
          continue;
        }
      } else if (rec.type === "CNAME") {
        const pointsAtAzure = azureCnameSuffixes.some((suf) => target.endsWith(suf));
        if (pointsAtAzure && !liveHosts.has(target)) {
          findings.push({
            fqdn,
            type: rec.type,
            target: raw,
            risk: "takeover-risk",
            detail: `CNAME to Azure resource "${raw}" that no longer exists in this tenant — classic subdomain-takeover vector.`,
          });
          continue;
        }
        if (!pointsAtAzure && !liveHosts.has(target)) {
          findings.push({
            fqdn,
            type: rec.type,
            target: raw,
            risk: "unresolved-cname",
            detail: `CNAME to external host "${raw}" — verify it still resolves and is under your control.`,
          });
          continue;
        }
      }

      findings.push({
        fqdn,
        type: rec.type,
        target: raw,
        risk: "ok",
        detail: "Target resolves to a live resource in this tenant.",
      });
    }
  }

  return findings.sort((a, b) => riskRank(b.risk) - riskRank(a.risk));
}

function riskRank(r: DnsRisk): number {
  return r === "takeover-risk" ? 2 : r === "unresolved-cname" ? 1 : 0;
}
