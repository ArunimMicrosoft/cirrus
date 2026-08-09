/**
 * IP Address Management (IPAM) analysis.
 *
 * Computes per-subnet IP utilisation, detects CIDR address-space overlaps
 * across the estate (the classic cause of failed peering / VPN), and — when
 * allocation history is available — forecasts exhaustion.
 *
 * Pure functions over already-fetched VNet + NIC + private-endpoint data.
 * No writes, no network.
 */

import {
  cidrSize,
  parseCidr,
  overlaps,
  type IpInterval,
} from "./cidr";

/** Azure reserves 5 addresses per subnet (network, gateway, 2×DNS, broadcast). */
const AZURE_RESERVED = 5;

export interface SubnetInput {
  id: string;
  name: string;
  vnet: string;
  addressPrefix: string;
  /** Count of allocated IPs (NIC ipconfigs + private endpoints + delegated). */
  allocated: number;
}

export interface SubnetUtil {
  id: string;
  name: string;
  vnet: string;
  cidr: string;
  /** Total addresses in the CIDR. */
  total: number;
  /** Usable after Azure's 5 reserved. */
  usable: number;
  allocated: number;
  free: number;
  utilisation: number; // 0..1 of usable
  severity: "critical" | "warning" | "ok";
}

export function subnetUtilisation(subnets: SubnetInput[]): SubnetUtil[] {
  return subnets
    .map((s) => {
      const total = cidrSize(s.addressPrefix);
      const usable = Math.max(0, total - AZURE_RESERVED);
      const allocated = Math.min(s.allocated, usable);
      const free = Math.max(0, usable - allocated);
      const utilisation = usable > 0 ? allocated / usable : 0;
      const severity: SubnetUtil["severity"] =
        utilisation >= 0.9 ? "critical" : utilisation >= 0.75 ? "warning" : "ok";
      return {
        id: s.id,
        name: s.name,
        vnet: s.vnet,
        cidr: s.addressPrefix,
        total,
        usable,
        allocated,
        free,
        utilisation,
        severity,
      };
    })
    .sort((a, b) => b.utilisation - a.utilisation);
}

export interface OverlapFinding {
  a: { scope: string; cidr: string };
  b: { scope: string; cidr: string };
  /** Size of the overlapping range in addresses. */
  overlapSize: number;
}

export interface AddressSpace {
  /** e.g. "vnet-hub" or "vnet-hub/snet-app" */
  scope: string;
  cidr: string;
}

/**
 * Detect overlapping address spaces across a set of CIDRs. O(n²) pairwise —
 * fine for the hundreds of ranges a tenant has. Skips comparing a scope with
 * itself and de-dupes symmetric pairs.
 */
export function detectOverlaps(spaces: AddressSpace[]): OverlapFinding[] {
  const parsed = spaces
    .map((s) => ({ ...s, iv: parseCidr(s.cidr) }))
    .filter((s): s is AddressSpace & { iv: IpInterval } => s.iv !== null);

  const out: OverlapFinding[] = [];
  for (let i = 0; i < parsed.length; i++) {
    for (let j = i + 1; j < parsed.length; j++) {
      const A = parsed[i];
      const B = parsed[j];
      // Ignore parent/child within the same VNet (subnet inside its VNet space).
      if (A.scope.startsWith(B.scope) || B.scope.startsWith(A.scope)) continue;
      if (overlaps(A.iv, B.iv)) {
        const lo = Math.max(A.iv.lo, B.iv.lo);
        const hi = Math.min(A.iv.hi, B.iv.hi);
        out.push({
          a: { scope: A.scope, cidr: A.cidr },
          b: { scope: B.scope, cidr: B.cidr },
          overlapSize: hi - lo + 1,
        });
      }
    }
  }
  return out.sort((x, y) => y.overlapSize - x.overlapSize);
}

/** Roll up utilisation across all subnets for headline stats. */
export function ipamSummary(utils: SubnetUtil[]): {
  subnets: number;
  totalUsable: number;
  totalAllocated: number;
  criticalCount: number;
  warningCount: number;
  overallUtil: number;
} {
  const totalUsable = utils.reduce((s, u) => s + u.usable, 0);
  const totalAllocated = utils.reduce((s, u) => s + u.allocated, 0);
  return {
    subnets: utils.length,
    totalUsable,
    totalAllocated,
    criticalCount: utils.filter((u) => u.severity === "critical").length,
    warningCount: utils.filter((u) => u.severity === "warning").length,
    overallUtil: totalUsable > 0 ? totalAllocated / totalUsable : 0,
  };
}
