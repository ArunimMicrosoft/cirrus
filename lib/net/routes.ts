/**
 * Route table (UDR) analysis.
 *
 * Evaluates user-defined routes with longest-prefix-match semantics and flags
 * the dangerous patterns: black-hole routes (next hop = None), routes to
 * NVA/appliance next-hops with no IP, default-route hijacks that bypass
 * expected egress, and route tables attached to nothing.
 *
 * Pure formal analysis over already-fetched route tables. No writes.
 */

import { parseCidr, prefixLen, type IpInterval } from "./cidr";

export interface RouteLite {
  name: string;
  addressPrefix: string;
  nextHopType: string; // "VirtualAppliance" | "Internet" | "VnetLocal" | "VirtualNetworkGateway" | "None"
  nextHopIp?: string;
}

export interface RouteTableLite {
  id: string;
  name: string;
  routes: RouteLite[];
  /** Number of subnets this route table is associated with. */
  subnetCount: number;
}

export interface RouteFinding {
  table: string;
  route: string;
  prefix: string;
  kind: "black-hole" | "missing-nva-ip" | "default-override" | "unassociated" | "ok";
  detail: string;
}

export function analyseRouteTables(tables: RouteTableLite[]): RouteFinding[] {
  const findings: RouteFinding[] = [];

  for (const t of tables) {
    if (t.subnetCount === 0) {
      findings.push({
        table: t.name,
        route: "—",
        prefix: "—",
        kind: "unassociated",
        detail: "Route table is not associated with any subnet — dead config.",
      });
      continue;
    }

    for (const r of t.routes) {
      // Black hole: traffic to this prefix is silently dropped.
      if ((r.nextHopType ?? "").toLowerCase() === "none") {
        findings.push({
          table: t.name,
          route: r.name,
          prefix: r.addressPrefix,
          kind: "black-hole",
          detail: `Next hop "None" — traffic to ${r.addressPrefix} is dropped. Intentional block, or a mistake?`,
        });
        continue;
      }
      // Appliance route with no next-hop IP: unreachable.
      if (
        (r.nextHopType ?? "").toLowerCase() === "virtualappliance" &&
        !r.nextHopIp
      ) {
        findings.push({
          table: t.name,
          route: r.name,
          prefix: r.addressPrefix,
          kind: "missing-nva-ip",
          detail: "Virtual-appliance next hop has no IP address — traffic will fail.",
        });
        continue;
      }
      // Default-route override: 0.0.0.0/0 forced somewhere other than Internet.
      if (r.addressPrefix === "0.0.0.0/0") {
        const hop = (r.nextHopType ?? "").toLowerCase();
        if (hop !== "internet") {
          findings.push({
            table: t.name,
            route: r.name,
            prefix: r.addressPrefix,
            kind: "default-override",
            detail: `All egress forced to "${r.nextHopType}"${r.nextHopIp ? ` (${r.nextHopIp})` : ""}. Confirm this is your intended NVA/firewall path.`,
          });
          continue;
        }
      }
      findings.push({
        table: t.name,
        route: r.name,
        prefix: r.addressPrefix,
        kind: "ok",
        detail: `→ ${r.nextHopType}${r.nextHopIp ? ` (${r.nextHopIp})` : ""}`,
      });
    }
  }

  return findings;
}

/**
 * Longest-prefix-match evaluation: given a destination IP and a route table,
 * return the route that would actually be selected. Exposed for a
 * "where does traffic to X go?" lookup in the UI.
 */
export function selectRoute(
  routes: RouteLite[],
  destIp: number,
): RouteLite | null {
  let best: { r: RouteLite; len: number } | null = null;
  for (const r of routes) {
    const iv: IpInterval | null = parseCidr(r.addressPrefix);
    if (!iv) continue;
    if (destIp >= iv.lo && destIp <= iv.hi) {
      const len = prefixLen(r.addressPrefix);
      if (!best || len > best.len) best = { r, len };
    }
  }
  return best?.r ?? null;
}
