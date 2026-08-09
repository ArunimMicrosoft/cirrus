"use client";

import { useQueries } from "@tanstack/react-query";
import { Gauge, Radio, TrendingDown, Sparkles } from "lucide-react";
import { PageHeader } from "@/components/data/PageHeader";
import { DataTable, type DataColumn } from "@/components/data/DataTable";
import { NoSubscriptionState } from "@/components/data/NoSubscriptionState";
import { ExportButtons } from "@/components/data/ExportButtons";
import { StatCard } from "@/components/data/StatCard";
import { useArmList } from "@/lib/hooks/use-arm";
import { useSubscriptionStore } from "@/lib/hooks/use-subscription";
import { ArmApi } from "@/lib/azure/arm";
import { api } from "@/lib/api-client";
import { formatCurrency, resourceGroupFromId } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import type { AdvisorRecommendation, VirtualMachine } from "@/lib/azure/types";
import { useVmPrices, HOURS_PER_MONTH } from "@/lib/hooks/use-vm-prices";
import {
  statsFromCpuSeries,
  gradeRecommendation,
  confidenceLabel,
  actionPriority,
  type Confidence,
  type ConfidenceResult,
  type MetricDataPoint,
  type RecommendationKind,
} from "@/lib/ml/rightsizing";

interface Row {
  id: string;
  name: string;
  resourceGroup: string;
  region: string;
  size: string;
  monthly: number;
  action: RecommendationKind;
  suggestedSize: string;
  estSavings: number;
  advisorText: string;
  live: boolean;
  priceLoading: boolean;
  confidence: Confidence;
  confidenceReason: string;
  cpuP95: number | null;
  cpuMax: number | null;
  metricsLoading: boolean;
}

interface MetricResponse {
  value: Array<{
    timeseries: Array<{ data: MetricDataPoint[] }>;
  }>;
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

  const pricePairs = vmList
    .map((vm) => ({
      size: vm.properties?.hardwareProfile?.vmSize ?? "",
      region: vm.location,
    }))
    .filter((p) => p.size);

  const advisorByVm = new Map<string, AdvisorRecommendation>();
  advisor.data?.value.forEach((rec) => {
    const rid = rec.properties?.resourceMetadata?.resourceId ?? "";
    if (rid.toLowerCase().includes("/virtualmachines/")) {
      const vmName = rid.split("/").pop()?.toLowerCase() ?? "";
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

  // Only fan out metrics for VMs that actually have an Advisor recommendation.
  // Avoids hammering Azure Monitor for VMs the operator doesn't need to
  // review, and keeps the initial page load fast.
  const vmsNeedingMetrics = vmList.filter((vm) =>
    advisorByVm.has((vm.name ?? "").toLowerCase()),
  );

  const metricQueries = useQueries({
    queries: vmsNeedingMetrics.map((vm) => ({
      queryKey: ["rightsizing-cpu", activeId, vm.id] as const,
      queryFn: async (): Promise<MetricResponse> => {
        if (!activeId) throw new Error("No active subscription");
        const rg = resourceGroupFromId(vm.id);
        const end = new Date();
        const start = new Date(end.getTime() - 30 * 24 * 60 * 60 * 1000);
        const timespan = `${start.toISOString()}/${end.toISOString()}`;
        const path =
          `/resourceGroups/${encodeURIComponent(rg)}` +
          `/providers/Microsoft.Compute/virtualMachines/${encodeURIComponent(vm.name)}` +
          `/providers/Microsoft.Insights/metrics`;
        // Params via api.arm's params arg — baking a query string into the
        // path produces a second "?" and the proxy rejects the request.
        return api.arm<MetricResponse>(activeId, path, ArmApi.monitorMetrics, {
          metricnames: "Percentage CPU",
          aggregation: "Average,Maximum",
          timespan,
          interval: "PT6H",
        });
      },
      enabled: Boolean(activeId),
      staleTime: 5 * 60_000,
      retry: false,
    })),
  });

  const metricsByVmId = new Map<string, { result: ConfidenceResult; loading: boolean }>();
  vmsNeedingMetrics.forEach((vm, i) => {
    const q = metricQueries[i];
    const advisorRec = advisorByVm.get((vm.name ?? "").toLowerCase());
    const advisorText = advisorRec
      ? `${advisorRec.properties?.shortDescription?.problem ?? ""} ${advisorRec.properties?.shortDescription?.solution ?? ""}`
      : "";
    const kind: RecommendationKind = /shut ?down|deallocate|idle/i.test(advisorText)
      ? "shut-down"
      : "resize";

    if (q?.isLoading) {
      metricsByVmId.set(vm.id, {
        result: {
          confidence: "NONE",
          reason: "Loading Azure Monitor metrics…",
          stats: null,
        },
        loading: true,
      });
      return;
    }
    if (q?.isError || !q?.data) {
      metricsByVmId.set(vm.id, {
        result: {
          confidence: "NONE",
          reason:
            q?.error instanceof Error
              ? `Metrics unavailable: ${q.error.message.slice(0, 120)}`
              : "Metrics unavailable.",
          stats: null,
        },
        loading: false,
      });
      return;
    }

    const points = q.data.value?.[0]?.timeseries?.[0]?.data ?? [];
    const stats = statsFromCpuSeries(points);
    metricsByVmId.set(vm.id, {
      result: gradeRecommendation(kind, stats),
      loading: false,
    });
  });

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

    let action: RecommendationKind = "right-sized";
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
            estSavings = monthly * 0.35;
          }
        } else {
          estSavings = monthly * 0.35;
        }
      }
    }

    const conf = metricsByVmId.get(vm.id) ?? {
      result: gradeRecommendation(action, null),
      loading: false,
    };

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
      confidence: conf.result.confidence,
      confidenceReason: conf.result.reason,
      cpuP95: conf.result.stats?.p95 ?? null,
      cpuMax: conf.result.stats?.max ?? null,
      metricsLoading: conf.loading,
    };
  });

  // Sort actionable rows first so operators see the money at the top.
  rows.sort((a, b) => {
    const ap = actionPriority(a.action, a.confidence);
    const bp = actionPriority(b.action, b.confidence);
    if (ap !== bp) return bp - ap;
    return b.estSavings - a.estSavings;
  });

  const oversized = rows.filter((r) => r.action === "resize").length;
  const idle = rows.filter((r) => r.action === "shut-down").length;
  const totalMonthly = rows.reduce((s, r) => s + r.monthly, 0);
  const liveCount = rows.filter((r) => r.live).length;

  // Only count savings for HIGH / MEDIUM confidence — LOW-confidence rows are
  // Advisor recommendations our metric evidence disagrees with.
  const trustedSavings = rows
    .filter((r) => r.action !== "right-sized" && (r.confidence === "HIGH" || r.confidence === "MEDIUM"))
    .reduce((s, r) => s + r.estSavings, 0);

  const highCount = rows.filter(
    (r) => r.action !== "right-sized" && r.confidence === "HIGH",
  ).length;
  const lowCount = rows.filter(
    (r) => r.action !== "right-sized" && r.confidence === "LOW",
  ).length;
  const metricsAnyLoading = metricQueries.some((q) => q.isLoading);

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
      header: "Advisor",
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
      key: "confidence",
      header: "Meridian verdict",
      accessor: (r) => r.confidence,
      cell: (r) => {
        if (r.action === "right-sized")
          return <span className="text-xs text-muted-foreground">—</span>;
        if (r.metricsLoading)
          return <span className="text-xs text-muted-foreground">Analysing…</span>;
        return <ConfidenceBadge value={r.confidence} reason={r.confidenceReason} />;
      },
    },
    {
      key: "cpu",
      header: "CPU (30d)",
      accessor: (r) => r.cpuP95 ?? 0,
      cell: (r) => {
        if (r.cpuP95 == null || r.cpuMax == null)
          return <span className="text-xs text-muted-foreground">—</span>;
        return (
          <span className="font-mono text-[11px] tabular-nums">
            p95 {r.cpuP95.toFixed(0)}% · max {r.cpuMax.toFixed(0)}%
          </span>
        );
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
          <span
            className={
              r.confidence === "LOW"
                ? "tabular-nums font-semibold text-muted-foreground line-through"
                : "tabular-nums font-semibold text-success"
            }
            title={
              r.confidence === "LOW"
                ? "Discounted: Meridian disagrees with Advisor on this VM"
                : "Estimated monthly savings"
            }
          >
            {r.confidence === "LOW" ? "" : "−"}
            {formatCurrency(r.estSavings)}
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
        description={`Advisor recommendations cross-referenced with live prices and 30-day CPU metrics for ${activeName ?? "this subscription"}.`}
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
              { header: "Advisor Action", accessor: (r) => r.action },
              { header: "Suggested Size", accessor: (r) => r.suggestedSize },
              { header: "Estimated Savings/mo", accessor: (r) => r.estSavings.toFixed(2) },
              { header: "Meridian Confidence", accessor: (r) => r.confidence },
              { header: "Confidence Reason", accessor: (r) => r.confidenceReason },
              { header: "CPU p95 (30d)", accessor: (r) => (r.cpuP95 == null ? "" : r.cpuP95.toFixed(1)) },
              { header: "CPU max (30d)", accessor: (r) => (r.cpuMax == null ? "" : r.cpuMax.toFixed(1)) },
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
          label="Trusted savings/mo"
          value={formatCurrency(trustedSavings)}
          delta={`${formatCurrency(trustedSavings * 12)}/year · high & medium confidence`}
          deltaTone={trustedSavings > 0 ? "positive" : "default"}
          icon={<TrendingDown className="h-4 w-4" />}
          loading={vms.isLoading || currentPrices.anyLoading || advisor.isLoading || metricsAnyLoading}
        />
        <StatCard
          label="Resize / Idle"
          value={`${oversized} · ${idle}`}
          delta={`${highCount} high · ${lowCount} disputed`}
          icon={<Sparkles className="h-4 w-4" />}
          loading={advisor.isLoading}
        />
      </div>

      <Alert variant="success">
        <Sparkles className="h-4 w-4" />
        <AlertTitle>What "Meridian verdict" means</AlertTitle>
        <AlertDescription>
          Every Advisor recommendation is scored against the VM's last 30 days
          of CPU metrics. <strong>High</strong> means the metrics agree —
          safe to act. <strong>Medium</strong> means mostly quiet with the
          occasional spike — verify before acting. <strong>Low</strong> means
          the VM is actually busy and Advisor is likely wrong — keep it.
          "Trusted savings" only counts high and medium.
        </AlertDescription>
      </Alert>

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

function ConfidenceBadge({
  value,
  reason,
}: {
  value: Confidence;
  reason: string;
}) {
  const label = confidenceLabel(value);
  if (value === "HIGH")
    return (
      <span title={reason}>
        <Badge variant="success">{label}</Badge>
      </span>
    );
  if (value === "MEDIUM")
    return (
      <span title={reason}>
        <Badge variant="warning">{label}</Badge>
      </span>
    );
  if (value === "LOW")
    return (
      <span title={reason}>
        <Badge variant="destructive">{label}</Badge>
      </span>
    );
  return (
    <span title={reason}>
      <Badge variant="outline">{label}</Badge>
    </span>
  );
}
