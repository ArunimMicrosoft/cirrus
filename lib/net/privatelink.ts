/**
 * Private Link / public-exposure coverage for PaaS resources.
 *
 * For each PaaS resource (storage, SQL, Key Vault, etc.) determines whether
 * it is reachable from the public Internet and whether a private endpoint
 * exists — surfacing the data-exfiltration paths architects care about most.
 *
 * Pure join over already-fetched resources + private endpoints. No writes.
 */

export interface PaasResource {
  id: string;
  name: string;
  kind: string; // "Storage" | "SQL" | "Key Vault" | ...
  /** True when the resource accepts traffic from the public Internet. */
  publicNetworkAccess: boolean;
  /** Optional: network default action, e.g. "Allow" | "Deny". */
  defaultAction?: string;
}

export interface PrivateEndpointLite {
  id: string;
  /** The resource id this PE connects to (privateLinkServiceId). */
  targetId: string;
}

export type ExposureLevel = "exposed" | "restricted" | "private" | "unknown";

export interface ExposureFinding {
  id: string;
  name: string;
  kind: string;
  level: ExposureLevel;
  hasPrivateEndpoint: boolean;
  detail: string;
}

function lc(s: string | undefined | null): string {
  return (s ?? "").toLowerCase();
}

export function analyseExposure(
  resources: PaasResource[],
  privateEndpoints: PrivateEndpointLite[],
): ExposureFinding[] {
  const peTargets = new Set(privateEndpoints.map((p) => lc(p.targetId)));

  return resources
    .map((r) => {
      const hasPE = peTargets.has(lc(r.id));
      let level: ExposureLevel;
      let detail: string;

      if (r.publicNetworkAccess && (r.defaultAction ?? "Allow") === "Allow" && !hasPE) {
        level = "exposed";
        detail = "Reachable from the public Internet with no private endpoint — a data-exfiltration path.";
      } else if (r.publicNetworkAccess && r.defaultAction === "Deny") {
        level = "restricted";
        detail = hasPE
          ? "Public access on, but firewalled to selected networks; private endpoint present."
          : "Public access on, but firewalled to selected networks.";
      } else if (!r.publicNetworkAccess || hasPE) {
        level = "private";
        detail = hasPE
          ? "Private endpoint present; public access disabled or restricted."
          : "Public network access disabled.";
      } else {
        level = "unknown";
        detail = "Could not determine exposure from available properties.";
      }

      return {
        id: r.id,
        name: r.name,
        kind: r.kind,
        level,
        hasPrivateEndpoint: hasPE,
        detail,
      };
    })
    .sort((a, b) => exposureRank(b.level) - exposureRank(a.level));
}

function exposureRank(l: ExposureLevel): number {
  return l === "exposed" ? 3 : l === "restricted" ? 2 : l === "private" ? 1 : 0;
}
