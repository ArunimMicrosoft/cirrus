"use client";

import { Coins, Radio, TrendingDown } from "lucide-react";
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
import type { VirtualMachine } from "@/lib/azure/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface Row {
  id: string;
  name: string;
  size: string;
  region: string;
  resourceGroup: string;
  paygMonthly: number;
  ri1yMonthly: number;
  ri3yMonthly: number;
  save1y: number;
  save3y: number;
  save1yPct: number;
  save3yPct: number;
  live: boolean;
}

interface Usage {
  currentValue: number;
  limit: number;
  name: { value: string; localizedValue: string };
  unit: string;
}

export default function RiQuotasPage() {
  const activeId = useSubscriptionStore((s) => s.activeId);
  const activeName = useSubscriptionStore((s) => s.activeName);

  const vms = useArmList<VirtualMachine>(
    "/providers/Microsoft.Compute/virtualMachines",
    ArmApi.computeVms,
  );

  const pairs = (vms.data?.value ?? [])
    .map((v) => ({ size: v.properties?.hardwareProfile?.vmSize ?? "", region: v.location }))
    .filter((p) => p.size);
  const prices = useVmPrices(pairs, true);

  const uniqueRegions = Array.from(new Set(pairs.map((p) => p.region))).filter(Boolean);
  // Compute quotas.list is region-scoped. Show quotas for the top 3 regions to keep it fast.
  const topRegions = uniqueRegions.slice(0, 3);

  // Note: Regional quota fetching would require multiple ARM calls with different query args.
  // For Phase 3 we surface only cost comparison here; quota fetch can be added when
  // useArmList supports region-scoped provider paths.

  const rows: Row[] = (vms.data?.value ?? []).map((vm) => {
    const size = vm.properties?.hardwareProfile?.vmSize ?? "-";
    const region = vm.location;
    const rate = prices.map.get(`${size}|${region}`);
    const paygHourly = rate?.paygHourly ?? 0;
    const ri1yHourly = rate?.ri1yHourly ?? paygHourly * 0.63;
    const ri3yHourly = rate?.ri3yHourly ?? paygHourly * 0.4;
    const paygMonthly = paygHourly * HOURS_PER_MONTH;
    const ri1yMonthly = ri1yHourly * HOURS_PER_MONTH;
    const ri3yMonthly = ri3yHourly * HOURS_PER_MONTH;
    return {
      id: vm.id,
      name: vm.name,
      size,
      region,
      resourceGroup: resourceGroupFromId(vm.id),
      paygMonthly,
      ri1yMonthly,
      ri3yMonthly,
      save1y: paygMonthly - ri1yMonthly,
      save3y: paygMonthly - ri3yMonthly,
      save1yPct: paygMonthly > 0 ? ((paygMonthly - ri1yMonthly) / paygMonthly) * 100 : 0,
      save3yPct: paygMonthly > 0 ? ((paygMonthly - ri3yMonthly) / paygMonthly) * 100 : 0,
      live: rate?.live ?? false,
    };
  });

  const totalPayg = rows.reduce((s, r) => s + r.paygMonthly, 0);
  const totalRi1y = rows.reduce((s, r) => s + r.ri1yMonthly, 0);
  const totalRi3y = rows.reduce((s, r) => s + r.ri3yMonthly, 0);
  const save1y = totalPayg - totalRi1y;
  const save3y = totalPayg - totalRi3y;
  const livePct = rows.length > 0 ? Math.round((rows.filter((r) => r.live).length / rows.length) * 100) : 0;

  const columns: DataColumn<Row>[] = [
    { key: "name", header: "VM", accessor: (r) => r.name, cell: (r) => <span className="font-medium">{r.name}</span> },
    { key: "size", header: "SKU", accessor: (r) => r.size },
    { key: "region", header: "Region", accessor: (r) => r.region },
    {
      key: "payg",
      header: "PAYG/mo",
      accessor: (r) => r.paygMonthly,
      cell: (r) => (
        <span className="tabular-nums">
          {formatCurrency(r.paygMonthly)} <span className="text-[10px]">{r.live ? "📡" : "📊"}</span>
        </span>
      ),
    },
    {
      key: "ri1y",
      header: "1-Yr RI/mo",
      accessor: (r) => r.ri1yMonthly,
      cell: (r) => <span className="tabular-nums">{formatCurrency(r.ri1yMonthly)}</span>,
    },
    {
      key: "ri3y",
      header: "3-Yr RI/mo",
      accessor: (r) => r.ri3yMonthly,
      cell: (r) => <span className="tabular-nums">{formatCurrency(r.ri3yMonthly)}</span>,
    },
    {
      key: "save3y",
      header: "3-Yr savings",
      accessor: (r) => r.save3y,
      cell: (r) => (
        <span className="tabular-nums font-semibold text-success">
          −{formatCurrency(r.save3y)}
          <span className="ml-1 text-xs text-muted-foreground">
            ({r.save3yPct.toFixed(0)}%)
          </span>
        </span>
      ),
    },
  ];

  if (!activeId) return <NoSubscriptionState />;

  return (
    <>
      <PageHeader
        icon={<Coins className="h-5 w-5" />}
        title="RI &amp; Quotas"
        description="Pay-As-You-Go vs Reserved Instance comparison using live Azure Retail Prices."
        actions={
          <ExportButtons
            filenameBase="ri_quotas"
            title="RI & Quotas Report"
            subtitle={activeName ?? undefined}
            rows={rows}
            columns={[
              { header: "VM", accessor: (r) => r.name },
              { header: "Size", accessor: (r) => r.size },
              { header: "Region", accessor: (r) => r.region },
              { header: "Resource Group", accessor: (r) => r.resourceGroup },
              { header: "PAYG Monthly", accessor: (r) => r.paygMonthly.toFixed(2) },
              { header: "1-Year RI Monthly", accessor: (r) => r.ri1yMonthly.toFixed(2) },
              { header: "3-Year RI Monthly", accessor: (r) => r.ri3yMonthly.toFixed(2) },
              { header: "1-Year Savings", accessor: (r) => r.save1y.toFixed(2) },
              { header: "3-Year Savings", accessor: (r) => r.save3y.toFixed(2) },
              { header: "3-Year Savings %", accessor: (r) => r.save3yPct.toFixed(1) },
              { header: "Live Pricing", accessor: (r) => (r.live ? "yes" : "no") },
            ]}
          />
        }
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard
          label="PAYG total/mo"
          value={formatCurrency(totalPayg)}
          loading={vms.isLoading || prices.anyLoading}
        />
        <StatCard
          label="1-Yr RI total/mo"
          value={formatCurrency(totalRi1y)}
          delta={`−${formatCurrency(save1y)}`}
          deltaTone="positive"
          loading={vms.isLoading || prices.anyLoading}
        />
        <StatCard
          label="3-Yr RI total/mo"
          value={formatCurrency(totalRi3y)}
          delta={`−${formatCurrency(save3y)}`}
          deltaTone="positive"
          loading={vms.isLoading || prices.anyLoading}
        />
        <StatCard
          label="Max annual savings"
          value={formatCurrency(save3y * 12)}
          icon={<TrendingDown className="h-4 w-4" />}
          loading={vms.isLoading || prices.anyLoading}
        />
      </div>

      <Alert>
        <Radio className="h-4 w-4" />
        <AlertTitle>Live pricing status</AlertTitle>
        <AlertDescription>
          📡 {livePct}% of VMs priced live from Azure Retail Prices API. Fallback
          estimates use 37% PAYG discount for 1-Yr and 60% for 3-Yr RI, which
          matches typical Azure RI economics.
        </AlertDescription>
      </Alert>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Regions in scope</CardTitle>
        </CardHeader>
        <CardContent className="text-sm">
          {topRegions.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {topRegions.map((r) => (
                <span
                  key={r}
                  className="rounded bg-secondary px-2 py-0.5 text-xs font-medium"
                >
                  {r}
                </span>
              ))}
            </div>
          ) : (
            <p className="text-muted-foreground">No VMs found.</p>
          )}
          <p className="mt-2 text-xs text-muted-foreground">
            Per-region quota utilisation (vCPUs, VM count) requires the{" "}
            <code className="text-[11px]">Microsoft.Compute/locations/{"{region}"}/usages</code>{" "}
            endpoint. Requesting quota increases is only possible from the Azure
            Portal (this app is READ-ONLY).
          </p>
        </CardContent>
      </Card>

      <DataTable
        rows={rows}
        columns={columns}
        isLoading={vms.isLoading}
        isError={vms.isError}
        error={vms.error}
        searchPlaceholder="Filter by VM name, SKU, or region…"
        emptyMessage="No VMs found in this subscription."
        getRowId={(r) => r.id}
      />
    </>
  );
}
