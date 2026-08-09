/**
 * Subnet-to-subnet reachability matrix + segmentation scoring.
 *
 * For every ordered pair of subnets, determines whether the source subnet can
 * reach the destination on any port, given:
 *   - Layer-3 connectivity: same VNet, or a bidirectional peering path.
 *   - The destination subnet NSG evaluated with real Azure semantics:
 *       * custom inbound securityRules, priority-ordered, and
 *       * the platform default rules (AllowVNetInBound / DenyAllInBound),
 *       * with Deny taking precedence for the ports it covers.
 *
 * The allowed-port set is computed by an interval sweep so a high-priority
 * Deny on a specific port correctly shadows a lower-priority broad Allow.
 *
 * Scope / honesty (a network engineer should know the boundaries):
 *   - This is NSG + Layer-3 reachability. User-defined routes, Azure
 *     Firewall / NVAs in the path, and per-NIC NSGs are NOT evaluated, so a
 *     path shown here can still be blocked (or, via a hub NVA, enabled)
 *     by routing. Peering is treated as non-transitive (correct).
 *   - The "VirtualNetwork" service tag is treated as spanning the local VNet
 *     and its directly peered VNets (matching Azure's default AllowVNetInBound).
 *   - Protocol (TCP/UDP) is not distinguished when deciding a port; a rule
 *     that admits a port admits it for reachability purposes.
 *
 * Pure formal analysis over already-fetched data. No writes, no network.
 */

import { parseCidr, overlaps, type IpInterval } from "./cidr";

export interface RuleLite {
  priority: number;
  direction: "Inbound" | "Outbound";
  access: "Allow" | "Deny";
  protocol: string;
  sourcePrefixes: string[]; // CIDR / "*" / "Internet" / "VirtualNetwork"
  destPorts: string[]; // "80" / "0-65535" / "*"
}

export interface SubnetLite {
  id: string;
  name: string;
  vnetId: string;
  addressPrefix: string;
  /** Effective inbound rules (subnet NSG). Empty = no NSG = allow-all in-VNet. */
  rules: RuleLite[];
  hasNsg: boolean;
}

export interface ReachEdge {
  from: string;
  to: string;
  /** Representative allowed ports (sample of the port set), for display. */
  ports: string;
  /** True when destination admits ALL ports from source. */
  wideOpen: boolean;
}

export interface ReachabilityResult {
  subnets: SubnetLite[];
  edges: ReachEdge[];
  /** id → display name. */
  names: Record<string, string>;
  /** 0..1 — fraction of possible directed pairs that are reachable. */
  density: number;
  /** 0..100 — higher is better segmentation (100 - density*100). */
  segmentationScore: number;
  /** Pairs that are wide-open (all ports) — the worst offenders. */
  wideOpenCount: number;
}

const PORT_MAX = 65535;

interface PortInterval {
  lo: number;
  hi: number;
}

function parsePorts(ranges: string[]): PortInterval[] {
  const out: PortInterval[] = [];
  for (const r of ranges) {
    const s = (r ?? "").trim();
    if (s === "*" || s === "") {
      out.push({ lo: 0, hi: PORT_MAX });
      continue;
    }
    if (s.includes("-")) {
      const [a, b] = s.split("-").map(Number);
      if (Number.isFinite(a) && Number.isFinite(b)) out.push({ lo: Math.min(a, b), hi: Math.max(a, b) });
    } else {
      const n = Number(s);
      if (Number.isFinite(n)) out.push({ lo: n, hi: n });
    }
  }
  return out;
}

/* -------- Port interval algebra (for correct Allow/Deny precedence) -------- */

function intersect(a: PortInterval, b: PortInterval): PortInterval | null {
  const lo = Math.max(a.lo, b.lo);
  const hi = Math.min(a.hi, b.hi);
  return lo <= hi ? { lo, hi } : null;
}

/** `u` minus `c` — the parts of u not covered by c (0, 1, or 2 pieces). */
function subtractOne(u: PortInterval, c: PortInterval): PortInterval[] {
  const x = intersect(u, c);
  if (!x) return [u];
  const res: PortInterval[] = [];
  if (u.lo < x.lo) res.push({ lo: u.lo, hi: x.lo - 1 });
  if (x.hi < u.hi) res.push({ lo: x.hi + 1, hi: u.hi });
  return res;
}

function mergeIntervals(ivs: PortInterval[]): PortInterval[] {
  if (ivs.length === 0) return [];
  const s = [...ivs].sort((a, b) => a.lo - b.lo);
  const out: PortInterval[] = [{ ...s[0] }];
  for (let i = 1; i < s.length; i++) {
    const last = out[out.length - 1];
    if (s[i].lo <= last.hi + 1) last.hi = Math.max(last.hi, s[i].hi);
    else out.push({ ...s[i] });
  }
  return out;
}

/** Does a source prefix token cover the given source subnet interval? */
function sourceCovers(token: string, inVnetScope: boolean, subnet: IpInterval): boolean {
  const t = (token ?? "").trim();
  if (t === "*" || t === "0.0.0.0/0" || t.toLowerCase() === "internet" || t.toLowerCase() === "any") {
    return true;
  }
  // The VirtualNetwork tag spans the local VNet AND directly peered VNets; at
  // this point L3 connectivity is already established, so an in-scope source
  // matches. (Azure's default AllowVNetInBound relies on exactly this.)
  if (t === "VirtualNetwork") return inVnetScope;
  const iv = parseCidr(t);
  return iv ? overlaps(iv, subnet) : false;
}

/** Azure platform default inbound rules, synthesized (lowest precedence). */
const DEFAULT_INBOUND: RuleLite[] = [
  {
    priority: 65000,
    direction: "Inbound",
    access: "Allow",
    protocol: "*",
    sourcePrefixes: ["VirtualNetwork"],
    destPorts: ["*"],
  },
  // AllowAzureLoadBalancerInBound (65001) is a probe path, irrelevant to
  // subnet-to-subnet reachability, so it is intentionally omitted.
  {
    priority: 65500,
    direction: "Inbound",
    access: "Deny",
    protocol: "*",
    sourcePrefixes: ["*"],
    destPorts: ["*"],
  },
];

/**
 * Evaluate whether `dest` admits inbound traffic from `srcInterval`, returning
 * the union of allowed destination-port intervals. Rules (custom + defaults)
 * are applied in priority order; each rule decides only the still-undecided
 * ports it covers, so a specific Deny correctly shadows a later broad Allow.
 */
function admittedPorts(dest: SubnetLite, srcInterval: IpInterval, inVnetScope: boolean): PortInterval[] {
  // No NSG on the destination subnet: within the VirtualNetwork scope (same
  // VNet or peered) Azure's default AllowVNetInBound admits all ports.
  if (!dest.hasNsg) {
    return inVnetScope ? [{ lo: 0, hi: PORT_MAX }] : [];
  }

  const ordered = [...dest.rules.filter((r) => r.direction === "Inbound"), ...DEFAULT_INBOUND].sort(
    (a, b) => a.priority - b.priority,
  );

  let undecided: PortInterval[] = [{ lo: 0, hi: PORT_MAX }];
  const allowed: PortInterval[] = [];

  for (const r of ordered) {
    if (undecided.length === 0) break;
    if (!r.sourcePrefixes.some((p) => sourceCovers(p, inVnetScope, srcInterval))) continue;
    const cover = parsePorts(r.destPorts);
    if (cover.length === 0) continue;

    const nextUndecided: PortInterval[] = [];
    for (const u of undecided) {
      // Parts of u this rule decides (u ∩ cover) and parts left undecided.
      let remaining: PortInterval[] = [u];
      for (const c of cover) {
        const hit = intersect(u, c);
        if (hit && r.access === "Allow") allowed.push(hit);
        remaining = remaining.flatMap((x) => subtractOne(x, c));
      }
      nextUndecided.push(...remaining);
    }
    undecided = nextUndecided;
  }

  return mergeIntervals(allowed);
}

function formatPorts(intervals: PortInterval[]): { text: string; wideOpen: boolean } {
  if (intervals.length === 0) return { text: "—", wideOpen: false };
  const wideOpen = intervals.some((p) => p.lo === 0 && p.hi === PORT_MAX);
  if (wideOpen) return { text: "all", wideOpen: true };
  const parts = intervals.slice(0, 4).map((p) => (p.lo === p.hi ? `${p.lo}` : `${p.lo}-${p.hi}`));
  return { text: parts.join(","), wideOpen: false };
}

/**
 * Compute the reachability matrix. `peeredPairs` is the set of bidirectionally
 * peered VNet id pairs (order-independent, encoded "a|b" with a<b).
 */
export function computeReachability(
  subnets: SubnetLite[],
  peeredPairs: Set<string>,
): ReachabilityResult {
  const names: Record<string, string> = {};
  subnets.forEach((s) => (names[s.id] = `${s.name}`));

  const vnetConnected = (v1: string, v2: string): boolean => {
    if (v1 === v2) return true;
    const key = v1 < v2 ? `${v1}|${v2}` : `${v2}|${v1}`;
    return peeredPairs.has(key);
  };

  const edges: ReachEdge[] = [];
  let reachable = 0;
  let wideOpenCount = 0;
  const n = subnets.length;
  const totalPairs = n * (n - 1);

  for (const src of subnets) {
    const srcIv = parseCidr(src.addressPrefix);
    if (!srcIv) continue;
    for (const dest of subnets) {
      if (src.id === dest.id) continue;
      // Layer-3 must be connected (same VNet or bidirectional peering).
      // Non-transitive: only a direct peering counts.
      const inVnetScope = vnetConnected(src.vnetId, dest.vnetId);
      if (!inVnetScope) continue;
      const ports = admittedPorts(dest, srcIv, inVnetScope);
      if (ports.length === 0) continue;
      const { text, wideOpen } = formatPorts(ports);
      reachable++;
      if (wideOpen) wideOpenCount++;
      edges.push({ from: src.id, to: dest.id, ports: text, wideOpen });
    }
  }

  const density = totalPairs > 0 ? reachable / totalPairs : 0;
  const segmentationScore = Math.round((1 - density) * 100);

  return {
    subnets,
    edges,
    names,
    density,
    segmentationScore,
    wideOpenCount,
  };
}
