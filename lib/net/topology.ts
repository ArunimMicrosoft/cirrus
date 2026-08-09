/**
 * VNet peering topology analysis.
 *
 * Builds the peering graph and surfaces the mistakes architects hit most:
 *   - Non-transitive reachability gaps (A↔B, B↔C, but A cannot reach C —
 *     Azure peering is NOT transitive).
 *   - Islands: VNets with no peering at all.
 *   - One-way peerings: A→B exists but B→A does not (broken/half-configured).
 *   - Hub detection: the VNet with the highest peering degree.
 *
 * Pure graph theory over already-fetched VNet peering data. No writes.
 */

export interface PeeringInput {
  vnetId: string;
  vnetName: string;
  /** Remote VNet ids this VNet is peered to (directed: this → remote). */
  peers: string[];
  /** allowGatewayTransit on this VNet's peerings (hub side). */
  allowsGatewayTransit?: boolean;
  /** useRemoteGateways on this VNet's peerings (spoke side). */
  usesRemoteGateways?: boolean;
}

export interface TopologyResult {
  /** VNets with no peerings. */
  islands: string[];
  /** Directed peerings missing their reverse leg. */
  oneWay: Array<{ from: string; to: string }>;
  /**
   * Transitivity gaps: pairs (a, c) that are connected only through an
   * intermediate hub b and therefore CANNOT actually reach each other.
   */
  transitivityGaps: Array<{ a: string; c: string; via: string }>;
  /** Node id → display name. */
  names: Record<string, string>;
  /** Highest-degree node — the de-facto hub. */
  hub: { id: string; degree: number } | null;
  /** Count of distinct connected components (islands of connectivity). */
  components: number;
}

export function analyseTopology(vnets: PeeringInput[]): TopologyResult {
  const names: Record<string, string> = {};
  const out = new Map<string, Set<string>>();
  for (const v of vnets) {
    names[v.vnetId] = v.vnetName;
    out.set(v.vnetId, new Set(v.peers));
  }

  // Islands.
  const islands = vnets.filter((v) => v.peers.length === 0).map((v) => v.vnetId);

  // One-way peerings.
  const oneWay: Array<{ from: string; to: string }> = [];
  for (const [from, peers] of out) {
    for (const to of peers) {
      if (!out.get(to)?.has(from)) oneWay.push({ from, to });
    }
  }

  // Bidirectional adjacency for transitivity + components.
  const bidir = new Map<string, Set<string>>();
  for (const id of out.keys()) bidir.set(id, new Set());
  for (const [from, peers] of out) {
    for (const to of peers) {
      if (out.get(to)?.has(from)) {
        bidir.get(from)?.add(to);
        bidir.get(to)?.add(from);
      }
    }
  }

  // Transitivity gaps: for each node b, any two distinct neighbours a,c that
  // are NOT directly peered form a gap (they route through b but peering is
  // non-transitive, so they can't actually reach each other).
  const gaps: Array<{ a: string; c: string; via: string }> = [];
  const seen = new Set<string>();
  for (const [b, neigh] of bidir) {
    const list = [...neigh];
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i];
        const c = list[j];
        if (bidir.get(a)?.has(c)) continue; // directly peered — fine
        const key = a < c ? `${a}|${c}` : `${c}|${a}`;
        if (seen.has(key)) continue;
        seen.add(key);
        gaps.push({ a, c, via: b });
      }
    }
  }

  // Connected components over the bidirectional graph.
  const visited = new Set<string>();
  let components = 0;
  for (const id of bidir.keys()) {
    if (visited.has(id)) continue;
    components++;
    const stack = [id];
    while (stack.length) {
      const u = stack.pop()!;
      if (visited.has(u)) continue;
      visited.add(u);
      for (const v of bidir.get(u) ?? []) if (!visited.has(v)) stack.push(v);
    }
  }

  // Hub = highest degree.
  let hub: { id: string; degree: number } | null = null;
  for (const [id, neigh] of bidir) {
    if (!hub || neigh.size > hub.degree) hub = { id, degree: neigh.size };
  }
  if (hub && hub.degree === 0) hub = null;

  return { islands, oneWay, transitivityGaps: gaps, names, hub, components };
}
