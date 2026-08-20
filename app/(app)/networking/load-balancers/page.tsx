"use client";

import { Scale } from "lucide-react";
import { PageHeader } from "@/components/data/PageHeader";
import { DataTable, type DataColumn } from "@/components/data/DataTable";
import { NoSubscriptionState } from "@/components/data/NoSubscriptionState";
import { ExportButtons } from "@/components/data/ExportButtons";
import { useArmList } from "@/lib/hooks/use-arm";
import { useSubscriptionStore } from "@/lib/hooks/use-subscription";
import { ArmApi } from "@/lib/azure/arm";
import type { LoadBalancer } from "@/lib/azure/types";
import { resourceGroupFromId } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

interface LbRow {
  id: string;
  name: string;
  resourceGroup: string;
  region: string;
  sku: string;
  exposure: string;
  frontends: number;
  backendPools: number;
  emptyBackends: number;
  rules: number;
  isBasic: boolean;
  hasEmptyBackend: boolean;
  noRules: boolean;
}

function poolSize(pool: { properties?: { loadBalancerBackendAddresses?: unknown[]; backendIPConfigurations?: unknown[] } }): number {
  const p = pool.properties ?? {};
  return (p.loadBalancerBackendAddresses?.length ?? 0) + (p.backendIPConfigurations?.length ?? 0);
}

function toRow(lb: LoadBalancer): LbRow {
  const p = lb.properties ?? {};
  const sku = lb.sku?.name ?? "Basic";
  const fronts = p.frontendIPConfigurations ?? [];
  const isPublic = fronts.some((f) => f.properties?.publicIPAddress?.id);
  const isInternal = fronts.some((f) => f.properties?.privateIPAddress || f.properties?.subnet?.id);
  const pools = p.backendAddressPools ?? [];
  const emptyBackends = pools.filter((pool) => poolSize(pool) === 0).length;
  const rules = (p.loadBalancingRules ?? []).length;
  return {
    id: lb.id,
    name: lb.name,
    resourceGroup: resourceGroupFromId(lb.id),
    region: lb.location,
    sku,
    exposure: isPublic ? (isInternal ? "Public + Internal" : "Public") : isInternal ? "Internal" : "—",
    frontends: fronts.length,
    backendPools: pools.length,
    emptyBackends,
    rules,
    isBasic: /basic/i.test(sku),
    hasEmptyBackend: emptyBackends > 0,
    noRules: rules === 0,
  };
}

const columns: DataColumn<LbRow>[] = [
  { key: "name", header: "Name", accessor: (r) => r.name, cell: (r) => <span className="font-medium">{r.name}</span> },
  { key: "rg", header: "Resource Group", accessor: (r) => r.resourceGroup },
  { key: "region", header: "Region", accessor: (r) => r.region },
  {
    key: "sku",
    header: "SKU",
    accessor: (r) => r.sku,
    cell: (r) => (r.isBasic ? <Badge variant="destructive">{r.sku} · retiring Sep 2025</Badge> : <Badge variant="secondary">{r.sku}</Badge>),
  },
  {
    key: "exposure",
    header: "Exposure",
    accessor: (r) => r.exposure,
    cell: (r) => <Badge variant={r.exposure.includes("Public") ? "warning" : "outline"}>{r.exposure}</Badge>,
  },
  { key: "frontends", header: "Frontends", accessor: (r) => r.frontends },
  {
    key: "pools",
    header: "Backend pools",
    accessor: (r) => r.backendPools,
    cell: (r) =>
      r.hasEmptyBackend ? (
        <Badge variant="warning">
          {r.backendPools} · {r.emptyBackends} empty
        </Badge>
      ) : (
        <span className="text-xs">{r.backendPools}</span>
      ),
  },
  {
    key: "rules",
    header: "LB rules",
    accessor: (r) => r.rules,
    cell: (r) => (r.noRules ? <Badge variant="warning">0 · idle</Badge> : <span className="text-xs">{r.rules}</span>),
  },
];

export default function LoadBalancersPage() {
  const activeId = useSubscriptionStore((s) => s.activeId);
  const activeName = useSubscriptionStore((s) => s.activeName);
  const { data, isLoading, isError, error } = useArmList<LoadBalancer>(
    "/providers/Microsoft.Network/loadBalancers",
    ArmApi.network,
  );

  const rows = (data?.value ?? []).map(toRow);
  const basic = rows.filter((r) => r.isBasic).length;
  const emptyPools = rows.filter((r) => r.hasEmptyBackend).length;
  const publicLbs = rows.filter((r) => r.exposure.includes("Public")).length;

  const description =
    rows.length === 0
      ? `No load balancers found in ${activeName ?? "the selected subscription"}.`
      : [
          `${rows.length} load balancer${rows.length === 1 ? "" : "s"}`,
          `${publicLbs} public · ${rows.length - publicLbs} internal`,
          basic > 0 ? `${basic} on Basic (retiring)` : null,
          emptyPools > 0 ? `${emptyPools} with empty backends` : null,
        ]
          .filter(Boolean)
          .join(" · ");

  if (!activeId) return <NoSubscriptionState />;

  return (
    <>
      <PageHeader
        icon={<Scale className="h-5 w-5" />}
        title="Load Balancers"
        description={description}
        actions={
          <ExportButtons
            filenameBase="load_balancers"
            title="Load Balancers Report"
            subtitle={activeName ?? undefined}
            rows={rows}
            columns={[
              { header: "Name", accessor: (r) => r.name },
              { header: "Resource Group", accessor: (r) => r.resourceGroup },
              { header: "Region", accessor: (r) => r.region },
              { header: "SKU", accessor: (r) => r.sku },
              { header: "Exposure", accessor: (r) => r.exposure },
              { header: "Frontends", accessor: (r) => String(r.frontends) },
              { header: "Backend Pools", accessor: (r) => String(r.backendPools) },
              { header: "Empty Pools", accessor: (r) => String(r.emptyBackends) },
              { header: "LB Rules", accessor: (r) => String(r.rules) },
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
        searchPlaceholder="Filter by name, SKU, or exposure…"
        emptyMessage="No load balancers found in this subscription."
        getRowId={(r) => r.id}
      />
    </>
  );
}
