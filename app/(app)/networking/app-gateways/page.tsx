"use client";

import { Waypoints, ShieldCheck } from "lucide-react";
import { PageHeader } from "@/components/data/PageHeader";
import { DataTable, type DataColumn } from "@/components/data/DataTable";
import { NoSubscriptionState } from "@/components/data/NoSubscriptionState";
import { ExportButtons } from "@/components/data/ExportButtons";
import { useArmList } from "@/lib/hooks/use-arm";
import { useSubscriptionStore } from "@/lib/hooks/use-subscription";
import { ArmApi } from "@/lib/azure/arm";
import type { ApplicationGateway } from "@/lib/azure/types";
import { resourceGroupFromId } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

interface GatewayRow {
  id: string;
  name: string;
  resourceGroup: string;
  region: string;
  operationalState: string;
  tier: string;
  capacity: string;
  frontendIps: number;
  backendPools: number;
  listeners: number;
  wafEnabled: boolean;
  wafMode: string;
}

function toRow(gw: ApplicationGateway): GatewayRow {
  const p = gw.properties ?? {};
  return {
    id: gw.id,
    name: gw.name,
    resourceGroup: resourceGroupFromId(gw.id),
    region: gw.location,
    operationalState: p.operationalState ?? "-",
    tier: gw.sku?.tier ?? gw.sku?.name ?? "-",
    capacity: gw.sku?.capacity != null ? String(gw.sku.capacity) : "auto",
    frontendIps: p.frontendIPConfigurations?.length ?? 0,
    backendPools: p.backendAddressPools?.length ?? 0,
    listeners: p.httpListeners?.length ?? 0,
    wafEnabled: p.webApplicationFirewallConfiguration?.enabled ?? false,
    wafMode: p.webApplicationFirewallConfiguration?.firewallMode ?? "-",
  };
}

const columns: DataColumn<GatewayRow>[] = [
  {
    key: "name",
    header: "Name",
    accessor: (r) => r.name,
    cell: (r) => <span className="font-medium">{r.name}</span>,
  },
  { key: "rg", header: "Resource Group", accessor: (r) => r.resourceGroup },
  { key: "region", header: "Region", accessor: (r) => r.region },
  {
    key: "state",
    header: "State",
    accessor: (r) => r.operationalState,
    cell: (r) => {
      const s = r.operationalState.toLowerCase();
      if (s === "running") return <Badge variant="success">Running</Badge>;
      if (s === "stopped") return <Badge variant="secondary">Stopped</Badge>;
      return <Badge variant="outline">{r.operationalState}</Badge>;
    },
  },
  {
    key: "tier",
    header: "Tier",
    accessor: (r) => r.tier,
    cell: (r) => <Badge variant="secondary">{r.tier}</Badge>,
  },
  {
    key: "capacity",
    header: "Capacity",
    accessor: (r) => r.capacity,
    cell: (r) => <span className="tabular-nums">{r.capacity}</span>,
  },
  {
    key: "pools",
    header: "Backend / Listeners",
    accessor: (r) => `${r.backendPools} pools, ${r.listeners} listeners`,
    cell: (r) => (
      <span className="text-xs text-muted-foreground tabular-nums">
        {r.backendPools} pools · {r.listeners} listeners · {r.frontendIps} FE-IP
      </span>
    ),
  },
  {
    key: "waf",
    header: "WAF",
    accessor: (r) => (r.wafEnabled ? r.wafMode : "off"),
    cell: (r) =>
      r.wafEnabled ? (
        <Badge variant="success">
          <ShieldCheck className="mr-1 h-3 w-3" />
          {r.wafMode}
        </Badge>
      ) : (
        <Badge variant="warning">Off</Badge>
      ),
  },
];

export default function ApplicationGatewaysPage() {
  const activeId = useSubscriptionStore((s) => s.activeId);
  const activeName = useSubscriptionStore((s) => s.activeName);
  const { data, isLoading, isError, error } = useArmList<ApplicationGateway>(
    "/providers/Microsoft.Network/applicationGateways",
    ArmApi.network,
  );

  const rows = (data?.value ?? []).map(toRow);

  if (!activeId) return <NoSubscriptionState />;

  return (
    <>
      <PageHeader
        icon={<Waypoints className="h-5 w-5" />}
        title="Application Gateways"
        description={`Layer-7 load balancers in ${activeName ?? "the selected subscription"}.`}
        actions={
          <ExportButtons
            filenameBase="app_gateways"
            title="Application Gateways Report"
            subtitle={activeName ?? undefined}
            rows={rows}
            columns={[
              { header: "Name", accessor: (r) => r.name },
              { header: "Resource Group", accessor: (r) => r.resourceGroup },
              { header: "Region", accessor: (r) => r.region },
              { header: "State", accessor: (r) => r.operationalState },
              { header: "Tier", accessor: (r) => r.tier },
              { header: "Capacity", accessor: (r) => r.capacity },
              { header: "Backend Pools", accessor: (r) => r.backendPools },
              { header: "Listeners", accessor: (r) => r.listeners },
              { header: "Frontend IPs", accessor: (r) => r.frontendIps },
              { header: "WAF Enabled", accessor: (r) => (r.wafEnabled ? "yes" : "no") },
              { header: "WAF Mode", accessor: (r) => r.wafMode },
            ]}
          />
        }
      />

      <DataTable
        rows={rows}
        columns={columns}
        isLoading={isLoading}
        isError={isError}
        error={error}
        searchPlaceholder="Filter by name or tier…"
        emptyMessage="No Application Gateways found in this subscription."
        getRowId={(r) => r.id}
      />
    </>
  );
}
