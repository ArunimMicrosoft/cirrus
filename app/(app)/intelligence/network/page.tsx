"use client";

import * as React from "react";
import { useQueries } from "@tanstack/react-query";
import { Route, ShieldAlert, GitBranch, Bomb, Lock, Globe, Scale, ListChecks } from "lucide-react";
import { PageHeader } from "@/components/data/PageHeader";
import { NoSubscriptionState } from "@/components/data/NoSubscriptionState";
import { StatCard } from "@/components/data/StatCard";
import { AlgorithmBadge } from "@/components/data/AlgorithmBadge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useArmList } from "@/lib/hooks/use-arm";
import { useSubscriptionStore } from "@/lib/hooks/use-subscription";
import { api } from "@/lib/api-client";
import { ArmApi } from "@/lib/azure/arm";
import { analyseRules, flattenRules, type RuleFinding } from "@/lib/ml/netgraph";
import { buildGraph, type AttackPath } from "@/lib/ml/attackpath";
import { analyseExposure, type PaasResource, type PrivateEndpointLite } from "@/lib/net/privatelink";
import { auditLoadBalancers, auditAppGateways, type LoadBalancerLite, type AppGatewayLite } from "@/lib/net/lbaudit";
import { optimiseNsgs, type NsgLite } from "@/lib/net/nsgopt";
import { detectDanglingDns, type DnsRecordLite } from "@/lib/net/dns";
import type {
  ApplicationGateway,
  AppService,
  KeyVault,
  NetworkInterface,
  NetworkSecurityGroup,
  PublicIpAddress,
  SqlServer,
  StorageAccount,
  VirtualMachine,
  VirtualNetwork,
  ManagedCluster,
  FrontDoor,
  AzureFirewall,
} from "@/lib/azure/types";

function lc(s: string | undefined | null): string {
  return (s ?? "").toLowerCase();
}

/* Loose ARM shapes for resource types without a full type. */
interface PrivateEndpointArm {
  id: string;
  properties?: {
    privateLinkServiceConnections?: Array<{ properties?: { privateLinkServiceId?: string } }>;
    manualPrivateLinkServiceConnections?: Array<{ properties?: { privateLinkServiceId?: string } }>;
  };
}
interface LoadBalancerArm {
  id: string;
  name: string;
  properties?: {
    backendAddressPools?: Array<{ name: string; properties?: { loadBalancerBackendAddresses?: unknown[]; backendIPConfigurations?: unknown[] } }>;
    loadBalancingRules?: Array<{ name: string; properties?: { probe?: { id: string } } }>;
    probes?: unknown[];
  };
}
interface DnsZoneArm {
  id: string;
  name: string;
}
interface RecordSetArm {
  name: string;
  type: string;
  properties?: {
    ARecords?: Array<{ ipv4Address?: string }>;
    AAAARecords?: Array<{ ipv6Address?: string }>;
    CNAMERecord?: { cname?: string };
  };
}

export default function NetworkIntelligencePage() {
  const activeId = useSubscriptionStore((s) => s.activeId);
  const activeName = useSubscriptionStore((s) => s.activeName);

  const nsgs = useArmList<NetworkSecurityGroup>("/providers/Microsoft.Network/networkSecurityGroups", ArmApi.network);
  const nics = useArmList<NetworkInterface>("/providers/Microsoft.Network/networkInterfaces", ArmApi.network);
  const pips = useArmList<PublicIpAddress>("/providers/Microsoft.Network/publicIPAddresses", ArmApi.network);
  const vnets = useArmList<VirtualNetwork>("/providers/Microsoft.Network/virtualNetworks", ArmApi.network);
  const vms = useArmList<VirtualMachine>("/providers/Microsoft.Compute/virtualMachines", ArmApi.computeVms);
  const sql = useArmList<SqlServer>("/providers/Microsoft.Sql/servers", ArmApi.sql);
  const kvs = useArmList<KeyVault>("/providers/Microsoft.KeyVault/vaults", ArmApi.keyvault);
  const storage = useArmList<StorageAccount>("/providers/Microsoft.Storage/storageAccounts", ArmApi.storage);
  const apps = useArmList<AppService>("/providers/Microsoft.Web/sites", ArmApi.web);
  const pes = useArmList<PrivateEndpointArm>("/providers/Microsoft.Network/privateEndpoints", ArmApi.network);
  const lbs = useArmList<LoadBalancerArm>("/providers/Microsoft.Network/loadBalancers", ArmApi.network);
  const appgws = useArmList<ApplicationGateway>("/providers/Microsoft.Network/applicationGateways", ArmApi.network);
  const pubZones = useArmList<DnsZoneArm>("/providers/Microsoft.Network/dnszones", ArmApi.dnsZones);
  const privZones = useArmList<DnsZoneArm>("/providers/Microsoft.Network/privateDnsZones", ArmApi.privateDnsZones);
  const aks = useArmList<ManagedCluster>("/providers/Microsoft.ContainerService/managedClusters", ArmApi.containerService);
  const frontDoors = useArmList<FrontDoor>("/providers/Microsoft.Network/frontdoors", ArmApi.frontDoor);
  const firewalls = useArmList<AzureFirewall>("/providers/Microsoft.Network/azureFirewalls", ArmApi.network);

  const anyLoading = [nsgs, nics, pips, vnets, vms, sql, kvs, storage, apps, pes, lbs, appgws].some((q) => q.isLoading);

  /* -------- Shadowed / exposed NSG analysis -------- */
  const nsgAnalysis = React.useMemo(
    () =>
      (nsgs.data?.value ?? []).map((n) => ({
        nsg: n.name,
        findings: analyseRules(flattenRules(n.properties?.securityRules ?? [])),
      })),
    [nsgs.data],
  );
  const shadowed = nsgAnalysis.flatMap((a) => a.findings.filter((f) => f.kind === "shadowed").map((f) => ({ nsg: a.nsg, f })));
  const exposed = nsgAnalysis.flatMap((a) => a.findings.filter((f) => f.kind === "internet-exposed").map((f) => ({ nsg: a.nsg, f })));

  /* -------- Attack-path graph -------- */
  const { paths, cutPoints } = React.useMemo(() => {
    if (anyLoading) return { paths: [] as AttackPath[], cutPoints: [] as string[] };
    const g = buildGraph({
      vms: vms.data?.value ?? [],
      nics: nics.data?.value ?? [],
      nsgs: nsgs.data?.value ?? [],
      pips: pips.data?.value ?? [],
      vnets: vnets.data?.value ?? [],
      sql: sql.data?.value ?? [],
      keyVaults: kvs.data?.value ?? [],
      aksClusters: aks.data?.value ?? [],
      frontDoors: frontDoors.data?.value ?? [],
      firewalls: firewalls.data?.value ?? [],
    });
    return { paths: g.attackPaths(), cutPoints: g.articulationPoints() };
  }, [anyLoading, vms.data, nics.data, nsgs.data, pips.data, vnets.data, sql.data, kvs.data, aks.data, frontDoors.data, firewalls.data]);

  /* -------- Private-link exposure -------- */
  const exposure = React.useMemo(() => {
    const resources: PaasResource[] = [];
    for (const s of storage.data?.value ?? []) {
      resources.push({
        id: s.id,
        name: s.name,
        kind: "Storage",
        publicNetworkAccess: s.properties?.networkAcls?.defaultAction !== "Deny",
        defaultAction: s.properties?.networkAcls?.defaultAction,
      });
    }
    for (const s of sql.data?.value ?? []) {
      resources.push({ id: s.id, name: s.name, kind: "SQL", publicNetworkAccess: true });
    }
    for (const k of kvs.data?.value ?? []) {
      resources.push({
        id: k.id,
        name: k.name,
        kind: "Key Vault",
        publicNetworkAccess: k.properties?.networkAcls?.defaultAction !== "Deny",
        defaultAction: k.properties?.networkAcls?.defaultAction,
      });
    }
    const peLites: PrivateEndpointLite[] = (pes.data?.value ?? []).flatMap((pe) => {
      const conns = [
        ...(pe.properties?.privateLinkServiceConnections ?? []),
        ...(pe.properties?.manualPrivateLinkServiceConnections ?? []),
      ];
      return conns
        .map((c) => c.properties?.privateLinkServiceId)
        .filter((x): x is string => Boolean(x))
        .map((targetId) => ({ id: pe.id, targetId }));
    });
    return analyseExposure(resources, peLites);
  }, [storage.data, sql.data, kvs.data, pes.data]);
  const exposedPaas = exposure.filter((e) => e.level === "exposed");

  /* -------- LB / App Gateway audit -------- */
  const lbFindings = React.useMemo(() => {
    const lite: LoadBalancerLite[] = (lbs.data?.value ?? []).map((lb) => ({
      id: lb.id,
      name: lb.name,
      backendPools: (lb.properties?.backendAddressPools ?? []).map((p) => ({
        name: p.name,
        members: (p.properties?.loadBalancerBackendAddresses?.length ?? 0) + (p.properties?.backendIPConfigurations?.length ?? 0),
      })),
      rules: (lb.properties?.loadBalancingRules ?? []).map((r) => ({ name: r.name, hasProbe: Boolean(r.properties?.probe?.id) })),
      probeCount: lb.properties?.probes?.length ?? 0,
    }));
    return auditLoadBalancers(lite);
  }, [lbs.data]);

  const gwFindings = React.useMemo(() => {
    const lite: AppGatewayLite[] = (appgws.data?.value ?? []).map((gw) => ({
      id: gw.id,
      name: gw.name,
      backendPools: (gw.properties?.backendAddressPools ?? []).map((p, i) => ({
        name: `pool-${i}`,
        members: p.properties?.backendAddresses?.length ?? 0,
      })),
      listenerCount: gw.properties?.httpListeners?.length ?? 0,
      ruleCount: 0,
      wafEnabled: Boolean(gw.properties?.webApplicationFirewallConfiguration?.enabled),
      wafMode: gw.properties?.webApplicationFirewallConfiguration?.firewallMode,
    }));
    return auditAppGateways(lite);
  }, [appgws.data]);

  const lbProblems = [...lbFindings, ...gwFindings].filter((f) => f.severity !== "ok");

  /* -------- NSG optimisation -------- */
  const nsgOpt = React.useMemo(() => {
    // Count associations: NICs referencing the NSG + subnets referencing it.
    const assoc = new Map<string, number>();
    for (const nic of nics.data?.value ?? []) {
      const id = lc(nic.properties?.networkSecurityGroup?.id);
      if (id) assoc.set(id, (assoc.get(id) ?? 0) + 1);
    }
    for (const vnet of vnets.data?.value ?? []) {
      for (const sub of vnet.properties?.subnets ?? []) {
        const id = lc(sub.properties?.networkSecurityGroup?.id);
        if (id) assoc.set(id, (assoc.get(id) ?? 0) + 1);
      }
    }
    const lite: NsgLite[] = (nsgs.data?.value ?? []).map((n) => ({
      id: n.id,
      name: n.name,
      associations: assoc.get(lc(n.id)) ?? 0,
      rules: (n.properties?.securityRules ?? []).map((r) => ({
        name: r.name,
        priority: r.properties.priority,
        direction: r.properties.direction,
        access: r.properties.access,
        protocol: r.properties.protocol,
        sources: [
          ...(r.properties.sourceAddressPrefix ? [r.properties.sourceAddressPrefix] : []),
          ...(r.properties.sourceAddressPrefixes ?? []),
        ],
        destPorts: [
          ...(r.properties.destinationPortRange ? [r.properties.destinationPortRange] : []),
          ...(r.properties.destinationPortRanges ?? []),
        ],
      })),
    }));
    return optimiseNsgs(lite);
  }, [nsgs.data, nics.data, vnets.data]);
  const nsgProblems = nsgOpt.filter((f) => f.severity !== "ok");

  /* -------- Dangling DNS (per-zone record-set fan-out) -------- */
  const zoneList = [
    ...(pubZones.data?.value ?? []).map((z) => ({ zone: z.name, kind: "public" as const })),
    ...(privZones.data?.value ?? []).map((z) => ({ zone: z.name, kind: "private" as const })),
  ];
  const recordQueries = useQueries({
    queries: zoneList.map((z) => ({
      queryKey: ["dns-records", activeId, z.kind, z.zone],
      queryFn: async (): Promise<{ zone: string; records: RecordSetArm[] }> => {
        if (!activeId) throw new Error("No active subscription");
        const provider = z.kind === "public" ? "dnszones" : "privateDnsZones";
        const ver = z.kind === "public" ? ArmApi.dnsZones : ArmApi.privateDnsZones;
        const path = `/providers/Microsoft.Network/${provider}/${encodeURIComponent(z.zone)}/${z.kind === "public" ? "recordsets" : "ALL"}`;
        try {
          const res = await api.armList<RecordSetArm>(activeId, path, ver);
          return { zone: z.zone, records: res.value };
        } catch {
          return { zone: z.zone, records: [] };
        }
      },
      enabled: Boolean(activeId) && zoneList.length > 0,
      staleTime: 5 * 60_000,
      retry: false,
    })),
  });

  const dnsFindings = React.useMemo(() => {
    const liveIps = new Set<string>();
    for (const p of pips.data?.value ?? []) if (p.properties?.ipAddress) liveIps.add(p.properties.ipAddress);
    const liveHostnames = new Set<string>();
    for (const a of apps.data?.value ?? []) if (a.properties?.defaultHostName) liveHostnames.add(a.properties.defaultHostName);

    const records: DnsRecordLite[] = [];
    recordQueries.forEach((q, i) => {
      const zone = zoneList[i]?.zone;
      if (!q.data || !zone) return;
      for (const rs of q.data.records) {
        const typeSuffix = (rs.type ?? "").split("/").pop() ?? "";
        if (typeSuffix === "A") {
          records.push({ zone, name: rs.name, type: "A", targets: (rs.properties?.ARecords ?? []).map((r) => r.ipv4Address ?? "").filter(Boolean) });
        } else if (typeSuffix === "CNAME") {
          const c = rs.properties?.CNAMERecord?.cname;
          if (c) records.push({ zone, name: rs.name, type: "CNAME", targets: [c] });
        }
      }
    });
    return detectDanglingDns(records, { liveIps, liveHostnames });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pips.data, apps.data, recordQueries.map((q) => q.dataUpdatedAt).join(","), zoneList.length]);
  const danglingDns = dnsFindings.filter((f) => f.risk === "takeover-risk");

  if (!activeId) return <NoSubscriptionState />;

  return (
    <>
      <PageHeader
        icon={<Route className="h-5 w-5" />}
        title="Network Intelligence"
        description={`NSG analysis, attack paths, private-link exposure, DNS hygiene, and load-balancer audits for ${activeName ?? "this subscription"}. Read-only.`}
      />

      <AlgorithmBadge keys={["intervalAlgebra", "dijkstra", "tarjan", "privateLinkCoverage", "danglingDns", "cidrMerge"]} />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-6">
        <StatCard label="Attack paths" value={paths.length} deltaTone={paths.length > 0 ? "negative" : "positive"} loading={anyLoading} />
        <StatCard label="Shadowed rules" value={shadowed.length} deltaTone={shadowed.length > 0 ? "negative" : "positive"} loading={nsgs.isLoading} />
        <StatCard label="Internet-exposed" value={exposed.length} deltaTone={exposed.length > 0 ? "negative" : "positive"} loading={nsgs.isLoading} />
        <StatCard label="Public PaaS" value={exposedPaas.length} delta="no private link" deltaTone={exposedPaas.length > 0 ? "negative" : "positive"} loading={anyLoading} />
        <StatCard label="Dangling DNS" value={danglingDns.length} delta="takeover risk" deltaTone={danglingDns.length > 0 ? "negative" : "positive"} loading={recordQueries.some((q) => q.isLoading)} />
        <StatCard label="LB/GW issues" value={lbProblems.length} deltaTone={lbProblems.length > 0 ? "negative" : "positive"} loading={anyLoading} />
      </div>

      <Alert>
        <GitBranch className="h-4 w-4" />
        <AlertTitle>All static analysis — nothing sent to Azure</AlertTitle>
        <AlertDescription>
          Shadowed rules use CIDR + port interval algebra; attack paths use
          Dijkstra over the resource graph; DNS takeover uses reference-integrity
          joins; PaaS exposure joins resources against private endpoints. Every
          finding is computed from inventory already read.
        </AlertDescription>
      </Alert>

      {/* Attack paths */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm font-semibold">
            <ShieldAlert className="h-4 w-4 text-primary" />
            Shortest attack paths (Internet → sensitive)
          </CardTitle>
        </CardHeader>
        <CardContent className="pb-4">
          {anyLoading ? (
            <p className="text-sm text-muted-foreground">Building resource graph…</p>
          ) : paths.length === 0 ? (
            <p className="text-sm text-success">No path found from the public Internet to a sensitive resource. Good.</p>
          ) : (
            <ul className="space-y-3">
              {paths.slice(0, 10).map((p) => (
                <li key={p.target} className="rounded-md border bg-card/60 p-3">
                  <div className="mb-1.5 flex items-center gap-2">
                    <Badge variant={p.risk >= 70 ? "destructive" : p.risk >= 40 ? "warning" : "outline"}>Risk {p.risk}</Badge>
                    <span className="text-sm font-medium">{p.targetLabel}</span>
                    <span className="ml-auto font-mono text-[11px] text-muted-foreground">{p.hops.length - 1} hops</span>
                  </div>
                  <div className="flex flex-wrap items-center gap-1 font-mono text-[11px] text-muted-foreground">
                    {p.hops.map((h, i) => (
                      <React.Fragment key={i}>
                        <span className={i === 0 ? "text-destructive" : i === p.hops.length - 1 ? "font-semibold text-foreground" : ""}>{h}</span>
                        {i < p.hops.length - 1 && <span className="text-primary">→</span>}
                      </React.Fragment>
                    ))}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* Private-link exposure + Dangling DNS */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-semibold">
              <Lock className="h-4 w-4 text-primary" />
              PaaS public exposure
            </CardTitle>
          </CardHeader>
          <CardContent className="pb-4">
            {exposedPaas.length === 0 ? (
              <p className="text-sm text-success">No PaaS resources exposed to the public Internet without private link.</p>
            ) : (
              <ul className="space-y-2">
                {exposedPaas.slice(0, 20).map((e) => (
                  <li key={e.id} className="rounded-md border bg-card/60 px-3 py-2 text-sm">
                    <div className="flex items-center gap-2">
                      <Badge variant="destructive">exposed</Badge>
                      <span className="font-medium">{e.name}</span>
                      <span className="ml-auto font-mono text-[10.5px] text-muted-foreground">{e.kind}</span>
                    </div>
                    <p className="mt-0.5 text-xs text-muted-foreground">{e.detail}</p>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-semibold">
              <Globe className="h-4 w-4 text-primary" />
              Dangling DNS (subdomain-takeover risk)
            </CardTitle>
          </CardHeader>
          <CardContent className="pb-4">
            {zoneList.length === 0 ? (
              <p className="text-sm text-muted-foreground">No DNS zones in this subscription.</p>
            ) : danglingDns.length === 0 ? (
              <p className="text-sm text-success">No dangling records — every A/CNAME resolves to a live resource.</p>
            ) : (
              <ul className="space-y-2">
                {danglingDns.slice(0, 20).map((d, i) => (
                  <li key={i} className="rounded-md border bg-card/60 px-3 py-2 text-sm">
                    <div className="flex items-center gap-2">
                      <Badge variant="destructive">{d.type}</Badge>
                      <span className="font-mono text-[12px]">{d.fqdn}</span>
                    </div>
                    <p className="mt-0.5 text-xs text-muted-foreground">{d.detail}</p>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      {/* LB/GW audit + NSG optimisation */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-semibold">
              <Scale className="h-4 w-4 text-primary" />
              Load balancer &amp; App Gateway audit
            </CardTitle>
          </CardHeader>
          <CardContent className="pb-4">
            {lbProblems.length === 0 ? (
              <p className="text-sm text-success">No misconfigured load balancers or gateways.</p>
            ) : (
              <ul className="space-y-2">
                {lbProblems.slice(0, 20).map((f, i) => (
                  <li key={i} className="rounded-md border bg-card/60 px-3 py-2 text-sm">
                    <div className="flex items-center gap-2">
                      <Badge variant={f.severity === "critical" ? "destructive" : "warning"}>{f.kind}</Badge>
                      <span className="font-medium">{f.resource}</span>
                    </div>
                    <p className="mt-0.5 text-xs text-muted-foreground">{f.detail}</p>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-semibold">
              <ListChecks className="h-4 w-4 text-primary" />
              NSG optimisation
            </CardTitle>
          </CardHeader>
          <CardContent className="pb-4">
            {nsgProblems.length === 0 ? (
              <p className="text-sm text-success">NSG rule sets are clean — no unused, duplicate, or overly-broad rules.</p>
            ) : (
              <ul className="space-y-2">
                {nsgProblems.slice(0, 20).map((f, i) => (
                  <li key={i} className="rounded-md border bg-card/60 px-3 py-2 text-sm">
                    <div className="flex items-center gap-2">
                      <Badge variant={f.severity === "warning" ? "warning" : "outline"}>{f.kind}</Badge>
                      <span className="font-mono text-[11px]">{f.nsg}</span>
                    </div>
                    <p className="mt-0.5 text-xs text-muted-foreground">{f.detail}</p>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Single points of failure */}
      {cutPoints.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-semibold">
              <Bomb className="h-4 w-4 text-primary" />
              Single points of failure ({cutPoints.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="pb-4">
            <p className="mb-2 text-xs text-muted-foreground">
              Articulation points — resources whose removal disconnects part of the network graph.
            </p>
            <div className="flex flex-wrap gap-1.5">
              {cutPoints.slice(0, 40).map((c) => (
                <span key={c} className="rounded border bg-muted/60 px-1.5 py-0.5 font-mono text-[10.5px] text-muted-foreground">
                  {c.split("/").pop()}
                </span>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Shadowed + exposed rules */}
      <div className="grid gap-4 lg:grid-cols-2">
        <RuleFindingCard title="Shadowed rules (dead config)" empty="No shadowed rules — every rule is reachable." rows={shadowed} />
        <RuleFindingCard title="Internet-exposed allows" empty="No inbound allows from the Internet on sensitive ports." rows={exposed} />
      </div>
    </>
  );
}

function RuleFindingCard({
  title,
  empty,
  rows,
}: {
  title: string;
  empty: string;
  rows: Array<{ nsg: string; f: RuleFinding }>;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold">{title}</CardTitle>
      </CardHeader>
      <CardContent className="pb-4">
        {rows.length === 0 ? (
          <p className="text-sm text-success">{empty}</p>
        ) : (
          <ul className="space-y-2">
            {rows.slice(0, 25).map(({ nsg, f }, i) => (
              <li key={`${nsg}-${f.rule}-${i}`} className="rounded-md border bg-card/60 px-3 py-2 text-sm">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-[11px] text-muted-foreground">{nsg}</span>
                  <span className="font-medium">{f.rule}</span>
                  <span className="ml-auto font-mono text-[10.5px] text-muted-foreground">prio {f.priority}</span>
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground">{f.detail}</p>
                {f.causedBy && f.causedBy.length > 0 && (
                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                    covered by: <span className="font-mono">{f.causedBy.join(", ")}</span>
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
