/**
 * Attack-path analysis over the Azure resource graph.
 *
 * Builds a directed graph from inventory (public IP → NIC → VM → subnet →
 * VNet → peering → subnet → VM …) gated by NSG reachability, then finds the
 * shortest / highest-risk path from the public Internet to sensitive
 * resources using Dijkstra with risk-weighted edges. Also finds articulation
 * points — single resources whose removal disconnects the graph (blast-radius
 * choke points).
 *
 * Pure graph theory over already-fetched data. No writes, no network.
 */

export interface GraphNode {
  id: string;
  label: string;
  kind:
    | "internet"
    | "publicIp"
    | "nic"
    | "vm"
    | "subnet"
    | "vnet"
    | "nsg"
    | "sensitive"
    | "apiServer"
    | "frontDoor"
    | "firewall";
  /** Higher = more valuable target (SQL, Key Vault, prod tag, etc.). */
  sensitivity?: number;
}

export interface GraphEdge {
  from: string;
  to: string;
  /** Lower weight = easier to traverse (e.g. an open NSG rule). */
  weight: number;
  reason: string;
}

export interface AttackPath {
  target: string;
  targetLabel: string;
  /** Ordered node ids from internet to target. */
  path: string[];
  /** Human-readable hops. */
  hops: string[];
  /** Total path weight (lower = more exposed). */
  cost: number;
  /** 0..100 risk score derived from cost + target sensitivity. */
  risk: number;
}

const INTERNET = "__internet__";

export class ResourceGraph {
  nodes = new Map<string, GraphNode>();
  adj = new Map<string, GraphEdge[]>();

  addNode(node: GraphNode) {
    if (!this.nodes.has(node.id)) {
      this.nodes.set(node.id, node);
      this.adj.set(node.id, []);
    }
  }

  addEdge(edge: GraphEdge) {
    if (!this.adj.has(edge.from)) this.adj.set(edge.from, []);
    this.adj.get(edge.from)!.push(edge);
  }

  /** Dijkstra shortest path from `source` to every node. */
  private dijkstra(source: string): { dist: Map<string, number>; prev: Map<string, string> } {
    const dist = new Map<string, number>();
    const prev = new Map<string, string>();
    for (const id of this.nodes.keys()) dist.set(id, Infinity);
    dist.set(source, 0);

    // Simple array-based PQ; graphs here are small (hundreds of nodes).
    const visited = new Set<string>();
    while (visited.size < this.nodes.size) {
      let u: string | null = null;
      let best = Infinity;
      for (const [id, d] of dist) {
        if (!visited.has(id) && d < best) {
          best = d;
          u = id;
        }
      }
      if (u === null) break;
      visited.add(u);
      for (const e of this.adj.get(u) ?? []) {
        const nd = dist.get(u)! + e.weight;
        if (nd < (dist.get(e.to) ?? Infinity)) {
          dist.set(e.to, nd);
          prev.set(e.to, u);
        }
      }
    }
    return { dist, prev };
  }

  /** Shortest attack paths from the Internet to every sensitive node. */
  attackPaths(): AttackPath[] {
    if (!this.nodes.has(INTERNET)) return [];
    const { dist, prev } = this.dijkstra(INTERNET);
    const paths: AttackPath[] = [];

    for (const node of this.nodes.values()) {
      if (node.kind !== "sensitive" && !(node.sensitivity && node.sensitivity > 0)) continue;
      const d = dist.get(node.id);
      if (d === undefined || !Number.isFinite(d)) continue; // unreachable — good

      // Reconstruct path.
      const path: string[] = [];
      let cur: string | undefined = node.id;
      let guard = 0;
      while (cur !== undefined && guard++ < 1000) {
        path.unshift(cur);
        if (cur === INTERNET) break;
        cur = prev.get(cur);
      }
      if (path[0] !== INTERNET) continue;

      const hops = path.map((id) => this.nodes.get(id)?.label ?? id);
      // Risk: closer targets (lower cost) and more sensitive targets score higher.
      const sensitivity = node.sensitivity ?? 5;
      const proximity = 1 / (1 + d); // 0..1, higher when cost is low
      const risk = Math.min(100, Math.round(proximity * 60 + sensitivity * 4));

      paths.push({
        target: node.id,
        targetLabel: node.label,
        path,
        hops,
        cost: d,
        risk,
      });
    }

    return paths.sort((a, b) => b.risk - a.risk);
  }

  /**
   * Articulation points (cut vertices) via Tarjan's DFS on the undirected
   * projection of the graph. Removing one disconnects some pair of nodes —
   * i.e. it is a single point of failure / blast-radius choke point.
   */
  articulationPoints(): string[] {
    const undirected = new Map<string, Set<string>>();
    for (const id of this.nodes.keys()) undirected.set(id, new Set());
    for (const [from, edges] of this.adj) {
      for (const e of edges) {
        undirected.get(from)?.add(e.to);
        undirected.get(e.to)?.add(from);
      }
    }

    const visited = new Set<string>();
    const disc = new Map<string, number>();
    const low = new Map<string, number>();
    const ap = new Set<string>();
    let timer = 0;

    const dfs = (u: string, parent: string | null) => {
      visited.add(u);
      disc.set(u, timer);
      low.set(u, timer);
      timer++;
      let children = 0;
      for (const v of undirected.get(u) ?? []) {
        if (v === parent) continue;
        if (visited.has(v)) {
          low.set(u, Math.min(low.get(u)!, disc.get(v)!));
        } else {
          children++;
          dfs(v, u);
          low.set(u, Math.min(low.get(u)!, low.get(v)!));
          if (parent !== null && low.get(v)! >= disc.get(u)!) ap.add(u);
        }
      }
      if (parent === null && children > 1) ap.add(u);
    };

    for (const id of this.nodes.keys()) {
      if (!visited.has(id)) dfs(id, null);
    }
    // Don't report the synthetic internet node.
    ap.delete(INTERNET);
    return [...ap];
  }

  /**
   * PageRank over the directed dependency graph. A resource scores high when
   * many (and highly-ranked) resources point at it — i.e. lots of the estate
   * ultimately leans on it. Standard power-iteration with damping + dangling
   * mass redistribution, so scores always sum to 1.
   */
  pageRank(opts: { damping?: number; iterations?: number } = {}): Map<string, number> {
    const d = opts.damping ?? 0.85;
    const iters = opts.iterations ?? 80;
    const ids = [...this.nodes.keys()];
    const N = ids.length;
    if (N === 0) return new Map();

    const outDeg = new Map<string, number>();
    for (const id of ids) outDeg.set(id, (this.adj.get(id) ?? []).length);

    let rank = new Map<string, number>(ids.map((id) => [id, 1 / N]));
    for (let it = 0; it < iters; it++) {
      const next = new Map<string, number>(ids.map((id) => [id, (1 - d) / N]));
      // Dangling nodes (no out-edges) spread their mass uniformly.
      let dangling = 0;
      for (const id of ids) if ((outDeg.get(id) ?? 0) === 0) dangling += rank.get(id)!;
      const danglingShare = (d * dangling) / N;
      for (const id of ids) {
        const edges = this.adj.get(id) ?? [];
        if (edges.length === 0) continue;
        const share = (d * rank.get(id)!) / edges.length;
        for (const e of edges) next.set(e.to, (next.get(e.to) ?? 0) + share);
      }
      if (danglingShare) for (const id of ids) next.set(id, next.get(id)! + danglingShare);
      rank = next;
    }
    return rank;
  }

  /** In-degree (how many resources point AT this node) over the directed graph. */
  inDegree(): Map<string, number> {
    const deg = new Map<string, number>(([...this.nodes.keys()]).map((id) => [id, 0]));
    for (const edges of this.adj.values()) {
      for (const e of edges) deg.set(e.to, (deg.get(e.to) ?? 0) + 1);
    }
    return deg;
  }
}

/* ------------------------------------------------------------------
 * Graph builder from inventory
 * ------------------------------------------------------------------*/

import type {
  NetworkInterface,
  NetworkSecurityGroup,
  PublicIpAddress,
  VirtualMachine,
  VirtualNetwork,
  SqlServer,
  KeyVault,
  ManagedCluster,
  FrontDoor,
  AzureFirewall,
} from "@/lib/azure/types";
import { flattenRules, analyseRules } from "./netgraph";

export interface GraphInputs {
  vms: VirtualMachine[];
  nics: NetworkInterface[];
  nsgs: NetworkSecurityGroup[];
  pips: PublicIpAddress[];
  vnets: VirtualNetwork[];
  sql?: SqlServer[];
  keyVaults?: KeyVault[];
  /** AKS clusters — a public API server is an internet-reachable control plane. */
  aksClusters?: ManagedCluster[];
  /** Front Doors — public entry points; endpoints without WAF are unfiltered. */
  frontDoors?: FrontDoor[];
  /** Azure Firewalls — presence means public-IP NICs bypass the perimeter. */
  firewalls?: AzureFirewall[];
}

function lc(s: string | undefined | null): string {
  return (s ?? "").toLowerCase();
}

/**
 * Assemble a reachability graph. An edge from the Internet into a NIC exists
 * only when the NIC has a public IP AND its effective NSG admits inbound
 * traffic from the Internet on a sensitive port (weight scales with how open
 * it is). Lateral edges follow subnet membership and VNet peerings.
 */
export function buildGraph(input: GraphInputs): ResourceGraph {
  const g = new ResourceGraph();
  g.addNode({ id: INTERNET, label: "Internet", kind: "internet" });

  const nsgById = new Map(input.nsgs.map((n) => [lc(n.id), n]));
  const pipById = new Map(input.pips.map((p) => [lc(p.id), p]));

  // Which NSGs have an internet-exposed sensitive allow?
  const nsgExposed = new Map<string, boolean>();
  for (const n of input.nsgs) {
    const findings = analyseRules(flattenRules(n.properties?.securityRules ?? []));
    nsgExposed.set(lc(n.id), findings.some((f) => f.kind === "internet-exposed"));
  }

  // Index subnets → their NSG, and subnet → vnet.
  const subnetNsg = new Map<string, string>();
  const subnetVnet = new Map<string, string>();
  for (const vnet of input.vnets) {
    g.addNode({ id: lc(vnet.id), label: vnet.name, kind: "vnet" });
    for (const sub of vnet.properties?.subnets ?? []) {
      g.addNode({ id: lc(sub.id), label: `${vnet.name}/${sub.name}`, kind: "subnet" });
      subnetVnet.set(lc(sub.id), lc(vnet.id));
      g.addEdge({ from: lc(sub.id), to: lc(vnet.id), weight: 1, reason: "subnet in vnet" });
      g.addEdge({ from: lc(vnet.id), to: lc(sub.id), weight: 1, reason: "vnet contains subnet" });
      const snsg = sub.properties?.networkSecurityGroup?.id;
      if (snsg) subnetNsg.set(lc(sub.id), lc(snsg));
    }
  }

  // VMs.
  const vmByNic = new Map<string, VirtualMachine>();
  for (const vm of input.vms) {
    g.addNode({ id: lc(vm.id), label: vm.name, kind: "vm" });
    for (const ni of vm.properties?.networkProfile?.networkInterfaces ?? []) {
      vmByNic.set(lc(ni.id), vm);
    }
  }

  // NICs: wire internet → nic (if exposed) and nic → vm, nic → subnet.
  for (const nic of input.nics) {
    const nid = lc(nic.id);
    g.addNode({ id: nid, label: nic.name, kind: "nic" });
    const vm = vmByNic.get(nid);
    if (vm) {
      g.addEdge({ from: nid, to: lc(vm.id), weight: 1, reason: "nic attached to vm" });
    }

    const ipcfg = nic.properties?.ipConfigurations?.[0]?.properties;
    const subnetId = lc(ipcfg?.subnet?.id);
    if (subnetId) {
      g.addEdge({ from: nid, to: subnetId, weight: 1, reason: "nic in subnet" });
      g.addEdge({ from: subnetId, to: nid, weight: 1, reason: "subnet reaches nic" });
    }

    // Effective NSG = NIC-level NSG, else subnet NSG.
    const nicNsg = lc(nic.properties?.networkSecurityGroup?.id);
    const effNsg = nicNsg || subnetNsg.get(subnetId) || "";
    const hasPip = Boolean(ipcfg?.publicIPAddress?.id);

    if (hasPip) {
      const pip = pipById.get(lc(ipcfg?.publicIPAddress?.id));
      const pipId = lc(ipcfg?.publicIPAddress?.id);
      g.addNode({ id: pipId, label: pip?.name ?? "public-ip", kind: "publicIp" });
      g.addEdge({ from: INTERNET, to: pipId, weight: 1, reason: "public endpoint" });
      // Internet → NIC only if the effective NSG exposes a sensitive port.
      const exposed = effNsg ? nsgExposed.get(effNsg) : true; // no NSG = wide open
      const weight = exposed ? 1 : 8; // open = cheap hop, filtered = expensive
      g.addEdge({
        from: pipId,
        to: nid,
        weight,
        reason: exposed ? "NSG admits internet on sensitive port" : "NSG filters inbound",
      });
    }
  }

  // VNet peerings — lateral movement between vnets (best-effort, by name match
  // in peering list is unavailable here, so connect subnets within same vnet
  // which Dijkstra already handles). Peering edges added if present.
  for (const vnet of input.vnets) {
    const peerings = vnet.properties?.virtualNetworkPeerings;
    if (Array.isArray(peerings)) {
      for (const p of peerings as Array<{ properties?: { remoteVirtualNetwork?: { id?: string } } }>) {
        const remote = lc(p.properties?.remoteVirtualNetwork?.id);
        if (remote && g.nodes.has(remote)) {
          g.addEdge({ from: lc(vnet.id), to: remote, weight: 2, reason: "vnet peering" });
        }
      }
    }
  }

  // Sensitive targets: mark SQL servers and Key Vaults, and prod-tagged VMs.
  for (const s of input.sql ?? []) {
    g.addNode({ id: lc(s.id), label: `SQL: ${s.name}`, kind: "sensitive", sensitivity: 9 });
  }
  for (const kv of input.keyVaults ?? []) {
    g.addNode({ id: lc(kv.id), label: `Key Vault: ${kv.name}`, kind: "sensitive", sensitivity: 10 });
  }
  for (const vm of input.vms) {
    const tags = vm.tags ?? {};
    const isProd = Object.entries(tags).some(
      ([k, v]) => lc(k).includes("env") && /prod/i.test(v),
    );
    if (isProd) {
      const node = g.nodes.get(lc(vm.id));
      if (node) node.sensitivity = Math.max(node.sensitivity ?? 0, 7);
    }
  }

  // --- Feature: enrich with edge/control-plane resources ---------------------

  // Public AKS API server: an internet-reachable Kubernetes control plane is a
  // high-value target and a direct one-hop path from the Internet.
  for (const c of input.aksClusters ?? []) {
    const apiId = `${lc(c.id)}/apiserver`;
    const priv = Boolean(c.properties?.apiServerAccessProfile?.enablePrivateCluster);
    g.addNode({ id: apiId, label: `AKS API: ${c.name}`, kind: "apiServer", sensitivity: 8 });
    if (!priv) {
      g.addEdge({ from: INTERNET, to: apiId, weight: 1, reason: "public AKS API server" });
    }
  }

  // Front Door: a public edge entry. Endpoints without a WAF policy are an
  // unfiltered path in; with WAF the hop is more expensive but still present.
  for (const fd of input.frontDoors ?? []) {
    const fdId = lc(fd.id);
    const eps = fd.properties?.frontendEndpoints ?? [];
    const anyNoWaf = eps.length > 0 && eps.some((e) => !e.properties?.webApplicationFirewallPolicyLink?.id);
    g.addNode({ id: fdId, label: `Front Door: ${fd.name}`, kind: "frontDoor", sensitivity: anyNoWaf ? 3 : 0 });
    g.addEdge({
      from: INTERNET,
      to: fdId,
      weight: anyNoWaf ? 1 : 3,
      reason: anyNoWaf ? "public Front Door endpoint without WAF" : "public Front Door endpoint (WAF)",
    });
  }

  // Azure Firewall present in the estate: any NIC that carries its own public
  // IP bypasses the perimeter. Mark those internet->pip hops as cheaper so the
  // attack path reflects the un-inspected route around the firewall.
  const hasFirewall = (input.firewalls ?? []).length > 0;
  if (hasFirewall) {
    for (const [from, edges] of g.adj) {
      if (from !== INTERNET) continue;
      for (const e of edges) {
        const target = g.nodes.get(e.to);
        if (target?.kind === "publicIp") {
          e.weight = Math.min(e.weight, 1);
          e.reason = "public IP bypasses Azure Firewall";
        }
      }
    }
  }

  return g;
}
