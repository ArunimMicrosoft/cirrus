"use client";

import * as React from "react";
import { Wallet, Radio } from "lucide-react";
import { PageHeader } from "@/components/data/PageHeader";
import { DataTable, type DataColumn } from "@/components/data/DataTable";
import { NoSubscriptionState } from "@/components/data/NoSubscriptionState";
import { ExportButtons } from "@/components/data/ExportButtons";
import { StatCard } from "@/components/data/StatCard";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useArmList } from "@/lib/hooks/use-arm";
import { useSubscriptionStore } from "@/lib/hooks/use-subscription";
import { ArmApi } from "@/lib/azure/arm";
import { formatCurrency, resourceGroupFromId } from "@/lib/utils";
import { HOURS_PER_MONTH, useVmPrices } from "@/lib/hooks/use-vm-prices";
import type {
  AppService,
  Disk,
  PublicIpAddress,
  SqlServer,
  StorageAccount,
  VirtualMachine,
} from "@/lib/azure/types";
import {
  estimateDiskMonthlyCost,
  estimatePublicIpMonthlyCost,
} from "@/lib/azure/prices";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface Resource {
  name: string;
  type: string;
  resourceGroup: string;
  location: string;
  monthlyCost: number;
  live: boolean;
  tags: Record<string, string>;
}

export default function CostAttributionPage() {
  const activeId = useSubscriptionStore((s) => s.activeId);
  const activeName = useSubscriptionStore((s) => s.activeName);

  const vms = useArmList<VirtualMachine>(
    "/providers/Microsoft.Compute/virtualMachines",
    ArmApi.computeVms,
  );
  const disks = useArmList<Disk>(
    "/providers/Microsoft.Compute/disks",
    ArmApi.computeDisks,
  );
  const pips = useArmList<PublicIpAddress>(
    "/providers/Microsoft.Network/publicIPAddresses",
    ArmApi.network,
  );
  const storage = useArmList<StorageAccount>(
    "/providers/Microsoft.Storage/storageAccounts",
    ArmApi.storage,
  );
  const apps = useArmList<AppService>(
    "/providers/Microsoft.Web/sites",
    ArmApi.web,
  );
  const sql = useArmList<SqlServer>(
    "/providers/Microsoft.Sql/servers",
    ArmApi.sql,
  );

  const vmPricePairs = (vms.data?.value ?? [])
    .map((v) => ({ size: v.properties?.hardwareProfile?.vmSize ?? "", region: v.location }))
    .filter((p) => p.size);
  const prices = useVmPrices(vmPricePairs);

  const resources: Resource[] = [];

  vms.data?.value.forEach((v) => {
    const size = v.properties?.hardwareProfile?.vmSize ?? "";
    const rate = prices.map.get(`${size}|${v.location}`);
    resources.push({
      name: v.name,
      type: "Virtual Machine",
      resourceGroup: resourceGroupFromId(v.id),
      location: v.location,
      monthlyCost: rate?.paygHourly ? rate.paygHourly * HOURS_PER_MONTH : 0,
      live: rate?.live ?? false,
      tags: (v.tags ?? {}) as Record<string, string>,
    });
  });

  disks.data?.value.forEach((d) => {
    resources.push({
      name: d.name,
      type: "Managed Disk",
      resourceGroup: resourceGroupFromId(d.id),
      location: d.location,
      monthlyCost: estimateDiskMonthlyCost(d.sku?.name ?? "", d.properties?.diskSizeGB ?? 0),
      live: false,
      tags: {},
    });
  });

  pips.data?.value.forEach((p) => {
    resources.push({
      name: p.name,
      type: "Public IP",
      resourceGroup: resourceGroupFromId(p.id),
      location: p.location,
      monthlyCost: estimatePublicIpMonthlyCost(),
      live: false,
      tags: {},
    });
  });

  storage.data?.value.forEach((s) => {
    resources.push({
      name: s.name,
      type: "Storage Account",
      resourceGroup: resourceGroupFromId(s.id),
      location: s.location,
      monthlyCost: 20, // rough placeholder — storage cost is usage-based
      live: false,
      tags: (s.tags ?? {}) as Record<string, string>,
    });
  });

  apps.data?.value.forEach((a) => {
    const isFunc = String(a.kind ?? "").toLowerCase().includes("function");
    resources.push({
      name: a.name,
      type: isFunc ? "Function App" : "App Service",
      resourceGroup: resourceGroupFromId(a.id),
      location: a.location,
      monthlyCost: isFunc ? 10 : 50,
      live: false,
      tags: {},
    });
  });

  sql.data?.value.forEach((s) => {
    resources.push({
      name: s.name,
      type: "SQL Server",
      resourceGroup: resourceGroupFromId(s.id),
      location: s.location,
      monthlyCost: 75,
      live: false,
      tags: {},
    });
  });

  const totalCost = resources.reduce((s, r) => s + r.monthlyCost, 0);
  const untagged = resources.filter((r) => Object.keys(r.tags).length === 0);
  const untaggedCost = untagged.reduce((s, r) => s + r.monthlyCost, 0);
  const untaggedPct = totalCost > 0 ? (untaggedCost / totalCost) * 100 : 0;

  const liveVmPriced = resources.filter((r) => r.type === "Virtual Machine" && r.live).length;
  const totalVms = resources.filter((r) => r.type === "Virtual Machine").length;
  const livePct = totalVms > 0 ? Math.round((liveVmPriced / totalVms) * 100) : 0;

  // Available tag keys across all resources.
  const tagKeys = new Set<string>();
  resources.forEach((r) => Object.keys(r.tags).forEach((k) => tagKeys.add(k)));
  const commonTagCandidates = [
    "environment",
    "Environment",
    "env",
    "Env",
    "owner",
    "Owner",
    "team",
    "Team",
    "cost-center",
    "CostCenter",
    "project",
    "Project",
  ];
  const defaultTag =
    commonTagCandidates.find((k) => tagKeys.has(k)) ?? [...tagKeys][0] ?? "";
  const [selectedTag, setSelectedTag] = React.useState<string>(defaultTag);

  // Keep selectedTag valid as data streams in.
  React.useEffect(() => {
    if (!selectedTag && defaultTag) setSelectedTag(defaultTag);
  }, [defaultTag, selectedTag]);

  const groupByTag = (key: string) => {
    const buckets = new Map<string, { count: number; cost: number }>();
    resources.forEach((r) => {
      const val = r.tags[key] ?? "⚠ Untagged";
      const cur = buckets.get(val) ?? { count: 0, cost: 0 };
      buckets.set(val, { count: cur.count + 1, cost: cur.cost + r.monthlyCost });
    });
    return [...buckets.entries()]
      .map(([value, v]) => ({ value, ...v }))
      .sort((a, b) => b.cost - a.cost);
  };

  const groupByField = <K extends keyof Resource>(field: K) => {
    const buckets = new Map<string, { count: number; cost: number }>();
    resources.forEach((r) => {
      const key = String(r[field] ?? "-");
      const cur = buckets.get(key) ?? { count: 0, cost: 0 };
      buckets.set(key, { count: cur.count + 1, cost: cur.cost + r.monthlyCost });
    });
    return [...buckets.entries()]
      .map(([value, v]) => ({ value, ...v }))
      .sort((a, b) => b.cost - a.cost);
  };

  const anyLoading =
    vms.isLoading || disks.isLoading || pips.isLoading || storage.isLoading || apps.isLoading || sql.isLoading;

  if (!activeId) return <NoSubscriptionState />;

  const columns: DataColumn<Resource>[] = [
    { key: "name", header: "Resource", accessor: (r) => r.name, cell: (r) => <span className="font-medium">{r.name}</span> },
    { key: "type", header: "Type", accessor: (r) => r.type },
    { key: "rg", header: "Resource Group", accessor: (r) => r.resourceGroup },
    { key: "loc", header: "Region", accessor: (r) => r.location },
    {
      key: "tags",
      header: "Tags",
      accessor: (r) =>
        Object.entries(r.tags)
          .map(([k, v]) => `${k}=${v}`)
          .join(", "),
      cell: (r) => {
        const entries = Object.entries(r.tags);
        if (entries.length === 0)
          return <span className="text-xs text-muted-foreground">untagged</span>;
        return (
          <span className="line-clamp-1 text-xs">
            {entries
              .slice(0, 3)
              .map(([k, v]) => `${k}=${v}`)
              .join(", ")}
            {entries.length > 3 && ` +${entries.length - 3}`}
          </span>
        );
      },
    },
    {
      key: "cost",
      header: "Est. monthly",
      accessor: (r) => r.monthlyCost,
      cell: (r) => (
        <span className="tabular-nums font-medium">
          {formatCurrency(r.monthlyCost)}{" "}
          <span className="text-[10px]" title={r.live ? "Live" : "Estimate"}>
            {r.live ? "📡" : "📊"}
          </span>
        </span>
      ),
    },
  ];

  const tagGroups = selectedTag ? groupByTag(selectedTag) : [];
  const typeGroups = groupByField("type");
  const rgGroups = groupByField("resourceGroup").slice(0, 20);
  const regionGroups = groupByField("location");

  return (
    <>
      <PageHeader
        icon={<Wallet className="h-5 w-5" />}
        title="Cost Attribution"
        description={`Hierarchical cost breakdown for ${activeName ?? "this subscription"} using live retail pricing where available.`}
        actions={
          <ExportButtons
            filenameBase="cost_attribution"
            title="Cost Attribution Report"
            subtitle={activeName ?? undefined}
            rows={resources}
            columns={[
              { header: "Name", accessor: (r) => r.name },
              { header: "Type", accessor: (r) => r.type },
              { header: "Resource Group", accessor: (r) => r.resourceGroup },
              { header: "Region", accessor: (r) => r.location },
              {
                header: "Tags",
                accessor: (r) =>
                  Object.entries(r.tags)
                    .map(([k, v]) => `${k}=${v}`)
                    .join("; "),
              },
              { header: "Monthly Cost", accessor: (r) => r.monthlyCost.toFixed(2) },
              { header: "Live Price", accessor: (r) => (r.live ? "yes" : "no") },
            ]}
          />
        }
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard
          label="Est. monthly total"
          value={formatCurrency(totalCost)}
          loading={anyLoading}
        />
        <StatCard
          label="Total resources"
          value={resources.length}
          loading={anyLoading}
        />
        <StatCard
          label="Untagged spend"
          value={formatCurrency(untaggedCost)}
          delta={`${untaggedPct.toFixed(0)}% of total`}
          deltaTone={untaggedPct > 20 ? "negative" : "default"}
          loading={anyLoading}
        />
        <StatCard
          label="Tag coverage"
          value={`${(100 - untaggedPct).toFixed(0)}%`}
          delta={`${resources.length - untagged.length}/${resources.length} tagged`}
          loading={anyLoading}
        />
      </div>

      <Alert>
        <Radio className="h-4 w-4" />
        <AlertTitle>Pricing source</AlertTitle>
        <AlertDescription>
          📡 VM prices are fetched live from the Azure Retail Prices API when
          possible ({livePct}% live for VMs this session). 📊 Other resources
          (disks, storage, App Service, SQL, Public IPs) use conservative
          fallback estimates — usage-based costs like blob storage and outbound
          data cannot be predicted from inventory alone.
        </AlertDescription>
      </Alert>

      {tagKeys.size > 0 && (
        <Card>
          <CardHeader className="pb-2 flex-row items-center justify-between">
            <CardTitle className="text-sm">Group cost by tag</CardTitle>
            <Select value={selectedTag} onValueChange={setSelectedTag}>
              <SelectTrigger className="w-56">
                <SelectValue placeholder="Select tag key" />
              </SelectTrigger>
              <SelectContent>
                {[...tagKeys].sort().map((k) => (
                  <SelectItem key={k} value={k}>
                    {k}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </CardHeader>
          <CardContent>
            <BreakdownList
              rows={tagGroups}
              total={totalCost}
              label={`Tag: ${selectedTag}`}
            />
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">By resource type</CardTitle>
          </CardHeader>
          <CardContent>
            <BreakdownList rows={typeGroups} total={totalCost} label="Type" />
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">By region</CardTitle>
          </CardHeader>
          <CardContent>
            <BreakdownList rows={regionGroups} total={totalCost} label="Region" />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">By resource group (top 20)</CardTitle>
        </CardHeader>
        <CardContent>
          <BreakdownList rows={rgGroups} total={totalCost} label="Resource Group" />
        </CardContent>
      </Card>

      <DataTable
        rows={resources}
        columns={columns}
        isLoading={anyLoading}
        searchPlaceholder="Filter by name, type, tag, or region…"
        emptyMessage="No resources found in this subscription."
        getRowId={(r, i) => `${r.type}-${r.name}-${i}`}
      />
    </>
  );
}

function BreakdownList({
  rows,
  total,
  label,
}: {
  rows: Array<{ value: string; count: number; cost: number }>;
  total: number;
  label: string;
}) {
  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground">No data yet.</p>;
  }
  return (
    <ul className="space-y-2">
      {rows.map((r) => {
        const pct = total > 0 ? (r.cost / total) * 100 : 0;
        return (
          <li key={r.value}>
            <div className="mb-1 flex items-center justify-between text-xs">
              <span className="font-medium">{r.value}</span>
              <span className="text-muted-foreground tabular-nums">
                {formatCurrency(r.cost)} · {pct.toFixed(0)}% · {r.count}
              </span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary"
                style={{ width: `${Math.max(2, pct)}%` }}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}
