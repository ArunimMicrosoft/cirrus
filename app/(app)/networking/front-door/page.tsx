"use client";

import { DoorOpen } from "lucide-react";
import { PageHeader } from "@/components/data/PageHeader";
import { DataTable, type DataColumn } from "@/components/data/DataTable";
import { NoSubscriptionState } from "@/components/data/NoSubscriptionState";
import { ExportButtons } from "@/components/data/ExportButtons";
import { useArmList } from "@/lib/hooks/use-arm";
import { useSubscriptionStore } from "@/lib/hooks/use-subscription";
import { ArmApi } from "@/lib/azure/arm";
import type { FrontDoor } from "@/lib/azure/types";
import { resourceGroupFromId } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

interface FdRow {
  id: string;
  name: string;
  resourceGroup: string;
  enabled: boolean;
  endpoints: number;
  wafCovered: number;
  backendPools: number;
  routingRules: number;
  wafGaps: number;
}

function toRow(fd: FrontDoor): FdRow {
  const p = fd.properties ?? {};
  const endpoints = p.frontendEndpoints ?? [];
  const wafCovered = endpoints.filter((e) => e.properties?.webApplicationFirewallPolicyLink?.id).length;
  const state = p.enabledState ?? p.resourceState ?? "Enabled";
  return {
    id: fd.id,
    name: fd.name,
    resourceGroup: resourceGroupFromId(fd.id),
    enabled: state === "Enabled",
    endpoints: endpoints.length,
    wafCovered,
    backendPools: (p.backendPools ?? []).length,
    routingRules: (p.routingRules ?? []).length,
    wafGaps: endpoints.length - wafCovered,
  };
}

const columns: DataColumn<FdRow>[] = [
  { key: "name", header: "Name", accessor: (r) => r.name, cell: (r) => <span className="font-medium">{r.name}</span> },
  { key: "rg", header: "Resource Group", accessor: (r) => r.resourceGroup },
  {
    key: "state",
    header: "State",
    accessor: (r) => (r.enabled ? "Enabled" : "Disabled"),
    cell: (r) => (r.enabled ? <Badge variant="success">Enabled</Badge> : <Badge variant="warning">Disabled</Badge>),
  },
  { key: "endpoints", header: "Frontend endpoints", accessor: (r) => r.endpoints },
  {
    key: "waf",
    header: "WAF coverage",
    accessor: (r) => `${r.wafCovered}/${r.endpoints}`,
    cell: (r) =>
      r.endpoints === 0 ? (
        <span className="text-xs">—</span>
      ) : r.wafGaps > 0 ? (
        <Badge variant="destructive">
          {r.wafCovered}/{r.endpoints} · {r.wafGaps} unprotected
        </Badge>
      ) : (
        <Badge variant="success">All {r.endpoints} protected</Badge>
      ),
  },
  { key: "pools", header: "Backend pools", accessor: (r) => r.backendPools },
  { key: "rules", header: "Routing rules", accessor: (r) => r.routingRules },
];

export default function FrontDoorPage() {
  const activeId = useSubscriptionStore((s) => s.activeId);
  const activeName = useSubscriptionStore((s) => s.activeName);
  const { data, isLoading, isError, error } = useArmList<FrontDoor>(
    "/providers/Microsoft.Network/frontdoors",
    ArmApi.frontDoor,
  );

  const rows = (data?.value ?? []).map(toRow);
  const totalEndpoints = rows.reduce((s, r) => s + r.endpoints, 0);
  const wafGaps = rows.reduce((s, r) => s + r.wafGaps, 0);
  const disabled = rows.filter((r) => !r.enabled).length;

  const description =
    rows.length === 0
      ? `No Front Door instances found in ${activeName ?? "the selected subscription"}.`
      : [
          `${rows.length} Front Door${rows.length === 1 ? "" : "s"} · ${totalEndpoints} endpoints`,
          wafGaps > 0 ? `${wafGaps} endpoint${wafGaps === 1 ? "" : "s"} without a WAF policy` : "all endpoints WAF-protected",
          disabled > 0 ? `${disabled} disabled` : null,
        ]
          .filter(Boolean)
          .join(" · ");

  if (!activeId) return <NoSubscriptionState />;

  return (
    <>
      <PageHeader
        icon={<DoorOpen className="h-5 w-5" />}
        title="Front Door"
        description={description}
        actions={
          <ExportButtons
            filenameBase="front_door"
            title="Front Door Report"
            subtitle={activeName ?? undefined}
            rows={rows}
            columns={[
              { header: "Name", accessor: (r) => r.name },
              { header: "Resource Group", accessor: (r) => r.resourceGroup },
              { header: "State", accessor: (r) => (r.enabled ? "Enabled" : "Disabled") },
              { header: "Frontend Endpoints", accessor: (r) => String(r.endpoints) },
              { header: "WAF Covered", accessor: (r) => String(r.wafCovered) },
              { header: "WAF Gaps", accessor: (r) => String(r.wafGaps) },
              { header: "Backend Pools", accessor: (r) => String(r.backendPools) },
              { header: "Routing Rules", accessor: (r) => String(r.routingRules) },
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
        searchPlaceholder="Filter by name or resource group…"
        emptyMessage="No Front Door instances found in this subscription."
        getRowId={(r) => r.id}
      />
    </>
  );
}
