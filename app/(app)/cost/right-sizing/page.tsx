"use client";

import { Gauge, Radio, TrendingDown } from "lucide-react";
import { PageHeader } from "@/components/data/PageHeader";
import { DataTable, type DataColumn } from "@/components/data/DataTable";
import { NoSubscriptionState } from "@/components/data/NoSubscriptionState";
import { ExportButtons } from "@/components/data/ExportButtons";
import { StatCard } from "@/components/data/StatCard";
import { useArmList } from "@/lib/hooks/use-arm";
import { useSubscriptionStore } from "@/lib/hooks/use-subscription";
import { ArmApi } from "@/lib/azure/arm";
import { formatCurrency, resourceGroupFromId } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import type { AdvisorRecommendation, VirtualMachine } from "@/lib/azure/types";
import { useVmPrices, HOURS_PER_MONTH } from "@/lib/hooks/use-vm-prices";

interface Row {
  id: string;
  name: string;
  resourceGroup: string;
  region: string;
  size: string;
  monthly: number;
  action: "right-sized" | "resize" | "shut-down";
  suggestedSize: string;
  estSavings: number;
  advisorText: string;
  live: boolean;
  priceLoading: boolean;
}

function extractSuggestedSize(text: string): string {
  const m = text.match(/Standard_[A-Za-z0-9_]+/);
  return m ? m[0] : "";
}

export default function RightSizingPage() {
  const activeId = useSubscriptionStore((s) => s.activeId);
  const activeName = useSubscriptionStore((s) => s.activeName);

  const vms = useArmList<VirtualMachine>(
    "/providers/Microsoft.Compute/virtualMachines",
    ArmApi.computeVms,
  );
  const advisor = useArmList<AdvisorRecommendation>(
    "/providers/Microsoft.Advisor/recommendations",
    ArmApi.advisor,
  );

  const vmList = vms.data?.value ?? [];

  // Build (size, region) pairs for pricing.
  const pricePairs = vmList
    .map((vm) => ({
      size: vm.properties?.hardwareProfile?.vmSize ?? "",
      region: vm.location,
    }))
    .filter((p) => p.size);

  // Also fetch suggested-size prices when Advisor provides them.
  const advisorByVm = new Map<string, AdvisorRecommendation>();
  advisor.data?.value.forEach((rec) => {
    const rid = rec.properties?.resourceMetadata?.resourceId ?? "";
    if (rid.toLowerCase().includes("/virtualmachines/")) {
      const vmName = rid.split("/").pop()?.toLowerCase() ?? "";
      // keep the first cost-category recommendation for this VM
      const cat = (rec.properties?.category ?? "").toLowerCase();
      const sol = rec.properties?.shortDescription?.solution ?? "";
      const prob = rec.properties?.shortDescription?.problem ?? "";
      const combined = `${sol} ${prob}`.toLowerCase();
      const isRight =
        cat === "cost" ||
        /right-?size|resize|underutilized|idle|shut ?down|scale down/i.test(combined);
      if (isRight && !advisorByVm.has(vmName)) advisorByVm.set(vmName, rec);
    }
  });

  const suggestedPairs = vmList.flatMap((vm) => {
    const advisorRec = advisorByVm.get((vm.name ?? "").toLowerCase());
    if (!advisorRec) return [];
    const suggested = extractSuggestedSize(
      `${advisorRec.properties?.shortDescription?.solution ?? ""} ${
        advisorRec.properties?.shortDescription?.problem ?? ""
      }`,
    );
    if (!suggested) return [];
    return [{ size: suggested, region: vm.location }];
  });

  const currentPrices = useVmPrices(pricePairs);
  const suggestedPrices = useVmPrices(suggestedPairs);

  const rows: Row[] = vmList.map((vm) => {
    const size = vm.properties?.hardwareProfile?.vmSize ?? "-";
    const region = vm.location;
    const priceKey = `${size}|${region}`;
    const rate = currentPrices.map.get(priceKey);
    const monthly = rate?.paygHourly != null ? rate.paygHourly * HOURS_PER_MONTH : 0;

    const advisorRec = advisorByVm.get((vm.name ?? "").toLowerCase());
    const advisorText = advisorRec
      ? `${advisorRec.properties?.shortDescription?.problem ?? ""} — ${
          advisorRec.properties?.shortDescription?.solution ?? ""
        }`
      : "";

    let action: Row["action"] = "right-sized";
    let suggestedSize = "-";
    let estSavings = 0;

    if (advisorRec) {
      const isIdle = /shut ?down|deallocate|idle/i.test(advisorText);
      if (isIdle) {
        action = "shut-down";
        suggestedSize = "Deallocate";
        estSavings = monthly;
      } else {
        action = "resize";
        const suggested = extractSuggestedSize(advisorText);
        suggestedSize = suggested || "See Advisor";
        if (suggested) {
          const suggestedRate = suggestedPrices.map.get(`${suggested}|${region}`);
          if (suggestedRate?.paygHourly != null) {
            const suggestedMonthly = suggestedRate.paygHourly * HOURS_PER_MONTH;
            estSavings = Math.max(0, monthly - suggestedMonthly);
          } else {
            estSavings = monthly * 0.35; // heuristic when suggested price not available
          }
        } else {
          estSavings = monthly * 0.35;
        }
      }
    }

    return {
      id: vm.id,
      name: vm.name,
      resourceGroup: resourceGroupFromId(vm.id),
      region,
      size,
      monthly,
      action,
      suggestedSize,
      estSavings,
      advisorText,
      live: rate?.live ?? false,
      priceLoading: rate?.loading ?? false,
    };
  });

  const oversized = rows.filter((r) => r.action === "resize").length;
  const idle = rows.filter((r) => r.action === "shut-down").length;
  const totalSavings = rows.reduce((s, r) => s + r.estSavings, 0);
  const totalMonthly = rows.reduce((s, r) => s + r.monthly, 0);
  const liveCount = rows.filter((r) => r.live).length;

  const columns: DataColumn<Row>[] = [
    {
      key: "name",
      header: "VM",
      accessor: (r) => r.name,
      cell: (r) => <span className="font-medium">{r.name}</span>,
    },
    { key: "rg", header: "Resource Group", accessor: (r) => r.resourceGroup },
    { key: "size", header: "Current SKU", accessor: (r) => r.size },
    { key: "region", header: "Region", accessor: (r) => r.region },
    {
      key: "monthly",
      header: "PAYG/mo",
      accessor: (r) => r.monthly,
      cell: (r) => (
        <span className="tabular-nums" title={r.live ? "Live pricing" : "Estimate"}>
          {r.priceLoading ? "…" : formatCurrency(r.monthly)}{" "}
          <span className="text-[10px]">{r.live ? "📡" : "📊"}</span>
        </span>
      ),
    },
    {
      key: "action",
      header: "Action",
      accessor: (r) => r.action,
      cell: (r) => {
        if (r.action === "shut-down")
          return <Badge variant="destructive">Shut down (idle)</Badge>;
        if (r.action === "resize")
          return <Badge variant="warning">Resize</Badge>;
        return <Badge variant="success">Right-sized</Badge>;
      },
    },
    {
      key: "target",
      header: "Suggested",
      accessor: (r) => r.suggestedSize,
      cell: (r) => (
        <span className="font-mono text-xs">{r.suggestedSize}</span>
      ),
    },
    {
      key: "savings",
      header: "Savings/mo",
      accessor: (r) => r.estSavings,
      cell: (r) =>
        r.estSavings > 0 ? (
          <span className="tabular-nums font-semibold text-success">
            −{formatCurrency(r.estSavings)}
          </span>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
  ];

  if (!activeId) return <NoSubscriptionState />;

  return (
    <>
      <PageHeader
        icon={<Gauge className="h-5 w-5" />}
        title="VM Right-Sizing Advisor"
        description={`Advisor recommendations cross-referenced with live Azure Retail Prices for ${activeName ?? "this subscription"}.`}
        actions={
          <ExportButtons
            filenameBase="vm_right_sizing"
            title="VM Right-Sizing Report"
            subtitle={activeName ?? undefined}
            rows={rows}
            columns={[
              { header: "VM", accessor: (r) => r.name },
              { header: "Resource Group", accessor: (r) => r.resourceGroup },
              { header: "Current SKU", accessor: (r) => r.size },
              { header: "Region", accessor: (r) => r.region },
              { header: "PAYG Monthly", accessor: (r) => r.monthly.toFixed(2) },
              { header: "Action", accessor: (r) => r.action },
              { header: "Suggested Size", accessor: (r) => r.suggestedSize },
              { header: "Estimated Savings/mo", accessor: (r) => r.estSavings.toFixed(2) },
              { header: "Live Pricing", accessor: (r) => (r.live ? "yes" : "no") },
              { header: "Advisor Text", accessor: (r) => r.advisorText },
            ]}
          />
        }
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard
          label="Total VMs"
          value={vmList.length}
          loading={vms.isLoading}
        />
        <StatCard
          label="Current PAYG/mo"
          value={formatCurrency(totalMonthly)}
          loading={vms.isLoading || currentPrices.anyLoading}
        />
        <StatCard
          label="Potential savings/mo"
          value={formatCurrency(totalSavings)}
          delta={`${formatCurrency(totalSavings * 12)} per year`}
          deltaTone={totalSavings > 0 ? "positive" : "default"}
          icon={<TrendingDown className="h-4 w-4" />}
          loading={vms.isLoading || currentPrices.anyLoading || advisor.isLoading}
        />
        <StatCard
          label="Resize / Idle"
          value={`${oversized} · ${idle}`}
          delta="resize · shut down"
          loading={advisor.isLoading}
        />
      </div>

      <Alert>
        <Radio className="h-4 w-4" />
        <AlertTitle>Pricing source</AlertTitle>
        <AlertDescription>
          📡 {liveCount}/{rows.length} VMs priced live from the Azure Retail Prices API. 📊 remainder use fallback estimates.
        </AlertDescription>
      </Alert>

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
