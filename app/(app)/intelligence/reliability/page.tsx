"use client";

import * as React from "react";
import { ShieldCheck, Server, Database, Network as NetworkIcon, Globe } from "lucide-react";
import { PageHeader } from "@/components/data/PageHeader";
import { NoSubscriptionState } from "@/components/data/NoSubscriptionState";
import { StatCard } from "@/components/data/StatCard";
import { ExportButtons } from "@/components/data/ExportButtons";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useArmList } from "@/lib/hooks/use-arm";
import { useSubscriptionStore } from "@/lib/hooks/use-subscription";
import { ArmApi } from "@/lib/azure/arm";
import type {
  VirtualMachine,
  StorageAccount,
  CosmosAccount,
  ManagedCluster,
  LoadBalancer,
  VirtualNetworkGateway,
  AzureFirewall,
} from "@/lib/azure/types";

type Status = "pass" | "warn" | "fail" | "info";
interface Finding {
  status: Status;
  text: string;
  resources?: string[];
}
interface Area {
  key: string;
  label: string;
  icon: React.ReactNode;
  score: number;
  findings: Finding[];
}

function grade(score: number): string {
  if (score >= 90) return "A";
  if (score >= 80) return "B";
  if (score >= 70) return "C";
  if (score >= 60) return "D";
  return "F";
}
function tone(score: number): "positive" | "default" | "negative" {
  if (score >= 80) return "positive";
  if (score >= 60) return "default";
  return "negative";
}

export default function ReliabilityPage() {
  const activeId = useSubscriptionStore((s) => s.activeId);
  const activeName = useSubscriptionStore((s) => s.activeName);

  const vms = useArmList<VirtualMachine>("/providers/Microsoft.Compute/virtualMachines", ArmApi.computeVms);
  const storage = useArmList<StorageAccount>("/providers/Microsoft.Storage/storageAccounts", ArmApi.storage);
  const cosmos = useArmList<CosmosAccount>("/providers/Microsoft.DocumentDB/databaseAccounts", ArmApi.documentDB);
  const aks = useArmList<ManagedCluster>("/providers/Microsoft.ContainerService/managedClusters", ArmApi.containerService);
  const lbs = useArmList<LoadBalancer>("/providers/Microsoft.Network/loadBalancers", ArmApi.network);
  const gws = useArmList<VirtualNetworkGateway>("/providers/Microsoft.Network/virtualNetworkGateways", ArmApi.network);
  const fws = useArmList<AzureFirewall>("/providers/Microsoft.Network/azureFirewalls", ArmApi.network);

  const anyLoading = [vms, storage, cosmos, aks, lbs, gws, fws].some((q) => q.isLoading);

  const model = React.useMemo(() => {
    const vmList = vms.data?.value ?? [];
    const stList = storage.data?.value ?? [];
    const cosmosList = cosmos.data?.value ?? [];
    const aksList = aks.data?.value ?? [];
    const lbList = lbs.data?.value ?? [];
    const gwList = gws.data?.value ?? [];
    const fwList = fws.data?.value ?? [];

    /* -------- Compute -------- */
    let compute = 100;
    const computeFindings: Finding[] = [];
    const singleVms = vmList.filter(
      (v) => (v.zones?.length ?? 0) === 0 && !v.properties?.availabilitySet?.id,
    );
    if (vmList.length > 0) {
      if (singleVms.length > 0) {
        compute -= Math.min(40, Math.ceil((singleVms.length / vmList.length) * 40));
        computeFindings.push({
          status: singleVms.length === vmList.length ? "fail" : "warn",
          text: `${singleVms.length}/${vmList.length} VMs run as a single instance (no availability zone or set) — no VM SLA`,
          resources: singleVms.map((v) => v.name),
        });
      } else {
        computeFindings.push({ status: "pass", text: `All ${vmList.length} VMs use zones or availability sets` });
      }
    }
    const freeAks = aksList.filter((c) => /free/i.test(c.sku?.tier ?? "Free"));
    const singlePoolAks = aksList.filter((c) => (c.properties?.agentPoolProfiles ?? []).length < 2);
    if (freeAks.length > 0) {
      compute -= Math.min(20, freeAks.length * 10);
      computeFindings.push({ status: "warn", text: `${freeAks.length} AKS cluster${freeAks.length === 1 ? "" : "s"} on the Free tier (no uptime SLA)`, resources: freeAks.map((c) => c.name) });
    }
    if (singlePoolAks.length > 0) {
      compute -= Math.min(15, singlePoolAks.length * 8);
      computeFindings.push({ status: "warn", text: `${singlePoolAks.length} AKS cluster${singlePoolAks.length === 1 ? "" : "s"} with a single node pool`, resources: singlePoolAks.map((c) => c.name) });
    }
    if (aksList.length > 0 && freeAks.length === 0 && singlePoolAks.length === 0) {
      computeFindings.push({ status: "pass", text: `All ${aksList.length} AKS clusters use a paid tier with multiple node pools` });
    }

    /* -------- Data -------- */
    let data = 100;
    const dataFindings: Finding[] = [];
    const lrs = stList.filter((s) => /(^|_)lrs$/i.test(s.sku?.name ?? ""));
    if (stList.length > 0) {
      if (lrs.length > 0) {
        data -= Math.min(25, Math.ceil((lrs.length / stList.length) * 25));
        dataFindings.push({
          status: "warn",
          text: `${lrs.length}/${stList.length} storage accounts use LRS (single-datacenter durability) — no regional/zone redundancy`,
          resources: lrs.map((s) => s.name),
        });
      } else {
        dataFindings.push({ status: "pass", text: `All ${stList.length} storage accounts use zone/geo-redundant replication` });
      }
    }
    const singleRegionCosmos = cosmosList.filter((c) => (c.properties?.locations?.length ?? 1) < 2);
    const noFailoverCosmos = cosmosList.filter(
      (c) => (c.properties?.locations?.length ?? 1) >= 2 && !c.properties?.enableAutomaticFailover,
    );
    if (singleRegionCosmos.length > 0) {
      data -= Math.min(25, singleRegionCosmos.length * 12);
      dataFindings.push({ status: "warn", text: `${singleRegionCosmos.length} Cosmos DB account${singleRegionCosmos.length === 1 ? "" : "s"} in a single region (no geo-redundancy)`, resources: singleRegionCosmos.map((c) => c.name) });
    }
    if (noFailoverCosmos.length > 0) {
      data -= Math.min(20, noFailoverCosmos.length * 10);
      dataFindings.push({ status: "fail", text: `${noFailoverCosmos.length} multi-region Cosmos account${noFailoverCosmos.length === 1 ? "" : "s"} without automatic failover`, resources: noFailoverCosmos.map((c) => c.name) });
    }
    if (cosmosList.length > 0 && singleRegionCosmos.length === 0 && noFailoverCosmos.length === 0) {
      dataFindings.push({ status: "pass", text: `All ${cosmosList.length} Cosmos accounts are multi-region with auto-failover` });
    }

    /* -------- Networking / edge -------- */
    let net = 100;
    const netFindings: Finding[] = [];
    const basicLbs = lbList.filter((l) => /basic/i.test(l.sku?.name ?? "Basic"));
    if (basicLbs.length > 0) {
      net -= Math.min(25, basicLbs.length * 10);
      netFindings.push({ status: "fail", text: `${basicLbs.length} Basic-SKU load balancer${basicLbs.length === 1 ? "" : "s"} (no SLA; retiring Sep 2025)`, resources: basicLbs.map((l) => l.name) });
    }
    const singleGws = gwList.filter((gw) => gw.properties?.gatewayType === "Vpn" && !gw.properties?.activeActive);
    const basicGws = gwList.filter((gw) => /basic/i.test(gw.properties?.sku?.name ?? ""));
    if (singleGws.length > 0) {
      net -= Math.min(20, singleGws.length * 10);
      netFindings.push({ status: "warn", text: `${singleGws.length} VPN gateway${singleGws.length === 1 ? "" : "s"} not active-active (single instance)`, resources: singleGws.map((g) => g.name) });
    }
    if (basicGws.length > 0) {
      net -= Math.min(15, basicGws.length * 10);
      netFindings.push({ status: "warn", text: `${basicGws.length} gateway${basicGws.length === 1 ? "" : "s"} on the Basic SKU (no SLA)`, resources: basicGws.map((g) => g.name) });
    }
    const noZoneFw = fwList.filter((f) => (f.zones?.length ?? 0) === 0);
    if (noZoneFw.length > 0) {
      net -= Math.min(20, noZoneFw.length * 10);
      netFindings.push({ status: "warn", text: `${noZoneFw.length} Azure Firewall${noZoneFw.length === 1 ? "" : "s"} without availability zones`, resources: noZoneFw.map((f) => f.name) });
    }
    if (lbList.length + gwList.length + fwList.length > 0 && netFindings.length === 0) {
      netFindings.push({ status: "pass", text: "Load balancers, gateways and firewalls are zone/SLA-covered" });
    }

    const areas: Area[] = [
      { key: "compute", label: "Compute", icon: <Server className="h-4 w-4" />, score: Math.max(0, compute), findings: computeFindings },
      { key: "data", label: "Data", icon: <Database className="h-4 w-4" />, score: Math.max(0, data), findings: dataFindings },
      { key: "network", label: "Networking & Edge", icon: <NetworkIcon className="h-4 w-4" />, score: Math.max(0, net), findings: netFindings },
    ].filter((a) => a.findings.length > 0);

    const scored = areas.length ? areas : [{ key: "none", label: "Reliability", icon: <ShieldCheck className="h-4 w-4" />, score: 100, findings: [{ status: "info", text: "No reliability-relevant resources found in this subscription." } as Finding] }];
    const overall = Math.round(scored.reduce((s, a) => s + a.score, 0) / scored.length);
    const singleInstance = singleVms.length;
    const singleRegionData = singleRegionCosmos.length + lrs.length;
    const atRiskNet = basicLbs.length + singleGws.length + basicGws.length + noZoneFw.length;

    return { areas: scored, overall, singleInstance, singleRegionData, atRiskNet };
  }, [vms.data, storage.data, cosmos.data, aks.data, lbs.data, gws.data, fws.data]);

  const exportRows = model.areas.flatMap((a) =>
    a.findings.map((f) => ({
      area: a.label,
      score: a.score,
      severity: f.status.toUpperCase(),
      finding: f.text,
      resources: (f.resources ?? []).join("; "),
    })),
  );

  if (!activeId) return <NoSubscriptionState />;

  return (
    <>
      <PageHeader
        icon={<ShieldCheck className="h-5 w-5" />}
        title="Reliability Scorecard"
        description={`Resilience grade for ${activeName ?? "this subscription"} — single points of failure, redundancy gaps, and SLA risks across compute, data, and the network edge. Read-only.`}
        actions={
          <ExportButtons
            filenameBase="reliability_scorecard"
            title="Reliability Scorecard"
            subtitle={activeName ?? undefined}
            rows={exportRows}
            columns={[
              { header: "Area", accessor: (r) => r.area },
              { header: "Area Score", accessor: (r) => `${r.score}` },
              { header: "Severity", accessor: (r) => r.severity },
              { header: "Finding", accessor: (r) => r.finding },
              { header: "Affected Resources", accessor: (r) => r.resources },
            ]}
          />
        }
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Reliability grade" value={`${model.overall}%`} delta={`Grade ${grade(model.overall)}`} deltaTone={tone(model.overall)} icon={<ShieldCheck className="h-4 w-4" />} loading={anyLoading} />
        <StatCard label="Single-instance VMs" value={model.singleInstance} delta="no VM SLA" deltaTone={model.singleInstance > 0 ? "negative" : "positive"} loading={anyLoading} />
        <StatCard label="Single-region data" value={model.singleRegionData} delta="no geo-redundancy" deltaTone={model.singleRegionData > 0 ? "negative" : "positive"} loading={anyLoading} />
        <StatCard label="At-risk network" value={model.atRiskNet} delta="SLA / zone gaps" deltaTone={model.atRiskNet > 0 ? "negative" : "positive"} loading={anyLoading} />
      </div>

      <Alert>
        <Globe className="h-4 w-4" />
        <AlertTitle>How the grade is computed</AlertTitle>
        <AlertDescription>
          A deterministic, weighted rubric aligned with the Well-Architected
          Reliability pillar. Each area starts at 100 and loses capped points per
          gap — single-instance VMs, LRS storage, single-region Cosmos, Basic
          load balancers/gateways, and firewalls without zones. The overall grade
          is the mean of the scored areas. No external calls, nothing leaves your
          tenant.
        </AlertDescription>
      </Alert>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {model.areas.map((a) => (
          <Card key={a.key}>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm font-semibold">
                <span className="flex h-6 w-6 items-center justify-center rounded-md bg-primary/10 text-primary">{a.icon}</span>
                {a.label}
                <Badge variant={a.score >= 80 ? "success" : a.score >= 60 ? "warning" : "destructive"} className="ml-auto">
                  {a.score}%
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2.5 text-sm">
                {a.findings.map((f, i) => (
                  <li key={i} className="flex gap-2">
                    <span className="mt-1 text-xs">
                      {f.status === "pass" && "🟢"}
                      {f.status === "warn" && "🟡"}
                      {f.status === "fail" && "🔴"}
                      {f.status === "info" && "ℹ"}
                    </span>
                    <div className="min-w-0 flex-1">
                      <span>{f.text}</span>
                      {f.resources && f.resources.length > 0 && (
                        <div className="mt-1 flex flex-wrap gap-1">
                          {f.resources.slice(0, 10).map((n) => (
                            <span key={n} className="rounded border bg-muted/40 px-1.5 py-0.5 font-mono text-[10.5px] text-muted-foreground">
                              {n}
                            </span>
                          ))}
                          {f.resources.length > 10 && (
                            <span className="px-1 text-[10.5px] text-muted-foreground">+{f.resources.length - 10} more</span>
                          )}
                        </div>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        ))}
      </div>
    </>
  );
}
