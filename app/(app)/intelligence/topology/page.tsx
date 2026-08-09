"use client";

import * as React from "react";
import { Share2, ShieldCheck, GitBranch, Route as RouteIcon } from "lucide-react";
import { PageHeader } from "@/components/data/PageHeader";
import { NoSubscriptionState } from "@/components/data/NoSubscriptionState";
import { StatCard } from "@/components/data/StatCard";
import { AlgorithmBadge } from "@/components/data/AlgorithmBadge";
import { TopologyGraph } from "@/components/data/TopologyGraph";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useArmList } from "@/lib/hooks/use-arm";
import { useSubscriptionStore } from "@/lib/hooks/use-subscription";
import { ArmApi } from "@/lib/azure/arm";
import { analyseTopology, type PeeringInput } from "@/lib/net/topology";
import {
  computeReachability,
  type SubnetLite,
  type RuleLite,
} from "@/lib/net/reachability";
import { analyseRouteTables, type RouteTableLite } from "@/lib/net/routes";
import type { NetworkSecurityGroup, VirtualNetwork } from "@/lib/azure/types";

interface RouteTableArm {
  id: string;
  name: string;
  properties?: {
    routes?: Array<{
      name: string;
      properties?: { addressPrefix?: string; nextHopType?: string; nextHopIpAddress?: string };
    }>;
    subnets?: Array<{ id: string }>;
  };
}

interface VnetPeeringArm {
  properties?: {
    remoteVirtualNetwork?: { id?: string };
    allowGatewayTransit?: boolean;
    useRemoteGateways?: boolean;
  };
}

function lc(s: string | undefined | null): string {
  return (s ?? "").toLowerCase();
}

export default function TopologyPage() {
  const activeId = useSubscriptionStore((s) => s.activeId);
  const activeName = useSubscriptionStore((s) => s.activeName);

  const vnets = useArmList<VirtualNetwork>(
    "/providers/Microsoft.Network/virtualNetworks",
    ArmApi.network,
  );
  const nsgs = useArmList<NetworkSecurityGroup>(
    "/providers/Microsoft.Network/networkSecurityGroups",
    ArmApi.network,
  );
  const routeTables = useArmList<RouteTableArm>(
    "/providers/Microsoft.Network/routeTables",
    ArmApi.network,
  );

  const anyLoading = vnets.isLoading || nsgs.isLoading || routeTables.isLoading;

  // ---- Peering topology ----
  const topology = React.useMemo(() => {
    const inputs: PeeringInput[] = (vnets.data?.value ?? []).map((v) => {
      const peerings = (v.properties?.virtualNetworkPeerings ?? []) as VnetPeeringArm[];
      return {
        vnetId: lc(v.id),
        vnetName: v.name,
        peers: peerings
          .map((p) => lc(p.properties?.remoteVirtualNetwork?.id))
          .filter(Boolean),
        allowsGatewayTransit: peerings.some((p) => p.properties?.allowGatewayTransit),
        usesRemoteGateways: peerings.some((p) => p.properties?.useRemoteGateways),
      };
    });
    return analyseTopology(inputs);
  }, [vnets.data]);

  // ---- Reachability matrix + segmentation ----
  const reachability = React.useMemo(() => {
    const nsgById = new Map((nsgs.data?.value ?? []).map((n) => [lc(n.id), n]));
    const subnets: SubnetLite[] = [];
    const peered = new Set<string>();

    for (const vnet of vnets.data?.value ?? []) {
      // record bidirectional peering pairs
      const peerings = (vnet.properties?.virtualNetworkPeerings ?? []) as VnetPeeringArm[];
      for (const p of peerings) {
        const remote = lc(p.properties?.remoteVirtualNetwork?.id);
        if (!remote) continue;
        const a = lc(vnet.id);
        const key = a < remote ? `${a}|${remote}` : `${remote}|${a}`;
        peered.add(key);
      }
      for (const sub of vnet.properties?.subnets ?? []) {
        const nsgId = lc(sub.properties?.networkSecurityGroup?.id);
        const nsg = nsgId ? nsgById.get(nsgId) : undefined;
        const rules: RuleLite[] = (nsg?.properties?.securityRules ?? []).map((r) => {
          const p = r.properties;
          return {
            priority: p.priority,
            direction: p.direction,
            access: p.access,
            protocol: p.protocol,
            sourcePrefixes: [
              ...(p.sourceAddressPrefix ? [p.sourceAddressPrefix] : []),
              ...(p.sourceAddressPrefixes ?? []),
            ],
            destPorts: [
              ...(p.destinationPortRange ? [p.destinationPortRange] : []),
              ...(p.destinationPortRanges ?? []),
            ],
          };
        });
        subnets.push({
          id: sub.id,
          name: `${vnet.name}/${sub.name}`,
          vnetId: lc(vnet.id),
          addressPrefix: sub.properties?.addressPrefix ?? "",
          rules,
          hasNsg: Boolean(nsg),
        });
      }
    }
    return computeReachability(subnets, peered);
  }, [vnets.data, nsgs.data]);

  // ---- Route table findings ----
  const routeFindings = React.useMemo(() => {
    const tables: RouteTableLite[] = (routeTables.data?.value ?? []).map((t) => ({
      id: t.id,
      name: t.name,
      subnetCount: t.properties?.subnets?.length ?? 0,
      routes: (t.properties?.routes ?? []).map((r) => ({
        name: r.name,
        addressPrefix: r.properties?.addressPrefix ?? "",
        nextHopType: r.properties?.nextHopType ?? "",
        nextHopIp: r.properties?.nextHopIpAddress,
      })),
    }));
    return analyseRouteTables(tables);
  }, [routeTables.data]);

  const routeProblems = routeFindings.filter((f) => f.kind !== "ok");

  if (!activeId) return <NoSubscriptionState />;

  return (
    <>
      <PageHeader
        icon={<Share2 className="h-5 w-5" />}
        title="Network Topology"
        description={`Peering graph, subnet reachability matrix, and route analysis for ${activeName ?? "this subscription"}. Graph theory + formal methods — read-only.`}
      />

      <AlgorithmBadge keys={["peeringGraph", "reachabilityMatrix", "segmentationScore", "longestPrefixMatch"]} />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard
          label="Segmentation score"
          value={reachability.subnets.length > 1 ? reachability.segmentationScore : "—"}
          delta="higher is better"
          deltaTone={reachability.segmentationScore >= 60 ? "positive" : "negative"}
          icon={<ShieldCheck className="h-4 w-4" />}
          loading={anyLoading}
        />
        <StatCard
          label="Wide-open subnet pairs"
          value={reachability.wideOpenCount}
          delta="all-ports reachable"
          deltaTone={reachability.wideOpenCount > 0 ? "negative" : "positive"}
          loading={anyLoading}
        />
        <StatCard
          label="Peering issues"
          value={topology.transitivityGaps.length + topology.oneWay.length + topology.islands.length}
          delta={`${topology.transitivityGaps.length} transitivity gaps`}
          deltaTone={topology.transitivityGaps.length > 0 ? "negative" : "default"}
          loading={anyLoading}
        />
        <StatCard
          label="Route problems"
          value={routeProblems.length}
          delta="black-holes / overrides"
          deltaTone={routeProblems.length > 0 ? "negative" : "positive"}
          loading={anyLoading}
        />
      </div>

      <Alert>
        <ShieldCheck className="h-4 w-4" />
        <AlertTitle>Segmentation score</AlertTitle>
        <AlertDescription>
          Computed as <strong>100 − reachability-graph density</strong>: the
          share of subnet pairs that can reach each other. A flat network
          where everything talks to everything scores near 0; tight
          micro-segmentation scores near 100. The matrix below is derived from
          NSG rules (including Azure&apos;s default <code>AllowVNetInBound</code>),
          peering, and Layer-3 connectivity — no packets sent. User-defined
          routes, Azure Firewall / NVAs in the path, and per-NIC NSGs are not
          evaluated, so a shown path can still be blocked (or, via a hub NVA,
          enabled) by routing.
        </AlertDescription>
      </Alert>

      {/* Live reachability graph — source → destination, same data as the
          matrix below, rendered as an animated read-only visualization. */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm font-semibold">
            <Share2 className="h-4 w-4 text-primary" />
            Reachability graph — source → destination
          </CardTitle>
        </CardHeader>
        <CardContent className="pb-4">
          {anyLoading ? (
            <p className="text-sm text-muted-foreground">Building the reachability graph…</p>
          ) : (
            <TopologyGraph
              nodes={reachability.subnets.map((s) => ({
                id: s.id,
                label: reachability.names[s.id] ?? s.name,
              }))}
              edges={reachability.edges.map((e) => ({
                from: e.from,
                to: e.to,
                wideOpen: e.wideOpen,
                ports: e.ports,
              }))}
            />
          )}
        </CardContent>
      </Card>

      {/* Peering issues */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-semibold">
              <GitBranch className="h-4 w-4 text-primary" />
              Peering topology
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 pb-4 text-sm">
            <div className="flex flex-wrap gap-2 text-[12px]">
              <span className="rounded border bg-card/60 px-2 py-1">
                {reachability.subnets.length} subnets · {topology.components} connectivity island(s)
              </span>
              {topology.hub && (
                <span className="rounded border bg-primary/10 px-2 py-1 text-primary">
                  Hub: {topology.names[topology.hub.id]} (degree {topology.hub.degree})
                </span>
              )}
            </div>
            {topology.transitivityGaps.length > 0 && (
              <div>
                <div className="mb-1 text-xs font-medium text-muted-foreground">
                  Transitivity gaps (peering is not transitive)
                </div>
                <ul className="space-y-1">
                  {topology.transitivityGaps.slice(0, 8).map((g, i) => (
                    <li key={i} className="rounded-md border bg-card/60 px-2.5 py-1.5 text-[12px]">
                      <span className="font-mono">{topology.names[g.a]}</span> ✕{" "}
                      <span className="font-mono">{topology.names[g.c]}</span>
                      <span className="text-muted-foreground"> — both peer {topology.names[g.via]} but cannot reach each other</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {topology.islands.length > 0 && (
              <div className="text-[12px] text-muted-foreground">
                Islands (no peering): {topology.islands.map((i) => topology.names[i]).join(", ")}
              </div>
            )}
            {topology.oneWay.length > 0 && (
              <div className="text-[12px] text-muted-foreground">
                {topology.oneWay.length} one-way peering(s) missing their reverse leg.
              </div>
            )}
            {topology.transitivityGaps.length === 0 && topology.oneWay.length === 0 && (
              <p className="text-success">No transitivity gaps or half-configured peerings.</p>
            )}
          </CardContent>
        </Card>

        {/* Routes */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-semibold">
              <RouteIcon className="h-4 w-4 text-primary" />
              Route table findings
            </CardTitle>
          </CardHeader>
          <CardContent className="pb-4">
            {routeProblems.length === 0 ? (
              <p className="text-sm text-success">No black-hole routes, bad next-hops, or unassociated tables.</p>
            ) : (
              <ul className="space-y-2">
                {routeProblems.slice(0, 12).map((f, i) => (
                  <li key={i} className="rounded-md border bg-card/60 px-3 py-2 text-sm">
                    <div className="flex items-center gap-2">
                      <Badge variant={f.kind === "black-hole" || f.kind === "missing-nva-ip" ? "destructive" : "warning"}>
                        {f.kind}
                      </Badge>
                      <span className="font-mono text-[11px]">{f.table}</span>
                      {f.prefix !== "—" && <span className="font-mono text-[11px] text-muted-foreground">{f.prefix}</span>}
                    </div>
                    <p className="mt-0.5 text-xs text-muted-foreground">{f.detail}</p>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Wide-open reachability edges */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold">
            Reachability — over-permissive subnet pairs
          </CardTitle>
        </CardHeader>
        <CardContent className="pb-4">
          {anyLoading ? (
            <p className="text-sm text-muted-foreground">Computing reachability matrix…</p>
          ) : reachability.edges.length === 0 ? (
            <p className="text-sm text-success">No cross-subnet reachability detected — fully segmented.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead className="border-b text-[11px] uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="px-2 py-1.5 text-left">Source subnet</th>
                    <th className="px-2 py-1.5 text-left">Destination subnet</th>
                    <th className="px-2 py-1.5 text-left">Allowed ports</th>
                  </tr>
                </thead>
                <tbody>
                  {[...reachability.edges]
                    .sort((a, b) => Number(b.wideOpen) - Number(a.wideOpen))
                    .slice(0, 30)
                    .map((e, i) => (
                      <tr key={i} className="border-b last:border-0">
                        <td className="px-2 py-1.5 font-mono text-[11px]">{reachability.names[e.from]}</td>
                        <td className="px-2 py-1.5 font-mono text-[11px]">{reachability.names[e.to]}</td>
                        <td className="px-2 py-1.5">
                          {e.wideOpen ? (
                            <Badge variant="destructive">all ports</Badge>
                          ) : (
                            <span className="font-mono text-[11px] text-muted-foreground">{e.ports}</span>
                          )}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </>
  );
}
