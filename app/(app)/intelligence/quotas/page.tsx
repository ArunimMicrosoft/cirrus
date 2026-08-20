"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { Gauge, AlertTriangle } from "lucide-react";
import { PageHeader } from "@/components/data/PageHeader";
import { NoSubscriptionState } from "@/components/data/NoSubscriptionState";
import { StatCard } from "@/components/data/StatCard";
import { AlgorithmBadge } from "@/components/data/AlgorithmBadge";
import { ExportButtons } from "@/components/data/ExportButtons";
import { DataTable, type DataColumn } from "@/components/data/DataTable";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { useArmList } from "@/lib/hooks/use-arm";
import { useSubscriptionStore } from "@/lib/hooks/use-subscription";
import { ArmApi } from "@/lib/azure/arm";
import { getOfflineEstate } from "@/lib/hooks/use-offline";
import { projectExhaustion } from "@/lib/ml/forecast";
import * as idb from "@/lib/idb";
import type { VirtualMachine, PublicIpAddress } from "@/lib/azure/types";

interface UsageItem {
  unit?: string;
  currentValue?: number;
  limit?: number;
  name?: { value?: string; localizedValue?: string };
}

interface QuotaRow {
  name: string;
  label: string;
  region: string;
  current: number;
  limit: number;
  util: number;
  etaDays: number | null;
  severity: "critical" | "warning" | "ok";
  hasForecast: boolean;
}

function dominantRegion(locs: string[]): string | null {
  const counts = new Map<string, number>();
  for (const l of locs) if (l) counts.set(l, (counts.get(l) ?? 0) + 1);
  let best: string | null = null;
  let bestN = 0;
  for (const [l, n] of counts) if (n > bestN) { best = l; bestN = n; }
  return best;
}

/** Deterministic ascending demo history ending near `current`. */
function synthSeries(name: string, current: number): number[] {
  let h = 2166136261;
  for (let i = 0; i < name.length; i++) { h ^= name.charCodeAt(i); h = Math.imul(h, 16777619); }
  const rand = () => { h = (h + 0x6d2b79f5) | 0; let t = Math.imul(h ^ (h >>> 15), 1 | h); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const start = current * 0.6;
  return Array.from({ length: 30 }, (_, i) => {
    const base = start + (current - start) * (i / 29);
    return Math.max(0, Math.round(base * (0.97 + rand() * 0.06)));
  });
}

export default function QuotaForecastPage() {
  const activeId = useSubscriptionStore((s) => s.activeId);
  const activeName = useSubscriptionStore((s) => s.activeName);
  const isDemo = Boolean(getOfflineEstate()?.demo);

  const vms = useArmList<VirtualMachine>("/providers/Microsoft.Compute/virtualMachines", ArmApi.computeVms);
  const pips = useArmList<PublicIpAddress>("/providers/Microsoft.Network/publicIPAddresses", ArmApi.network);

  const region = React.useMemo(
    () =>
      dominantRegion([
        ...(vms.data?.value ?? []).map((v) => v.location),
        ...(pips.data?.value ?? []).map((p) => p.location),
      ]),
    [vms.data, pips.data],
  );

  const regionReady = Boolean(region);
  const loc = region ?? "eastus";
  const computeUsage = useArmList<UsageItem>(
    `/providers/Microsoft.Compute/locations/${loc}/usages`,
    ArmApi.computeUsage,
    { enabled: regionReady },
  );
  const networkUsage = useArmList<UsageItem>(
    `/providers/Microsoft.Network/locations/${loc}/usages`,
    ArmApi.network,
    { enabled: regionReady },
  );

  const anyLoading = vms.isLoading || pips.isLoading || computeUsage.isLoading || networkUsage.isLoading;

  const samples: idb.QuotaSample[] = React.useMemo(() => {
    const items = [...(computeUsage.data?.value ?? []), ...(networkUsage.data?.value ?? [])];
    return items
      .filter((u) => (u.limit ?? 0) > 0)
      .map((u) => ({
        name: u.name?.value ?? "?",
        label: u.name?.localizedValue ?? u.name?.value ?? "?",
        region: loc,
        current: u.currentValue ?? 0,
        limit: u.limit ?? 0,
      }));
  }, [computeUsage.data, networkUsage.data, loc]);

  // Live: record today's snapshot so the forecast accrues over time. (Demo
  // synthesizes history instead, so we don't pollute the store with random data.)
  React.useEffect(() => {
    if (!activeId || isDemo || samples.length === 0) return;
    idb.putQuotaSnapshot(activeId, samples).catch(() => {});
  }, [activeId, isDemo, samples]);

  const history = useQuery({
    queryKey: ["quota-history-idb", activeId],
    queryFn: () => (activeId ? idb.listQuotaSnapshots(activeId) : Promise.resolve([])),
    enabled: Boolean(activeId) && !isDemo,
    staleTime: 10_000,
  });

  const rows: QuotaRow[] = React.useMemo(() => {
    return samples
      .map((s) => {
        const util = s.limit > 0 ? s.current / s.limit : 0;
        // Build a per-quota daily series: demo synth, else real recorded history.
        let series: number[];
        if (isDemo) {
          series = synthSeries(s.name, s.current);
        } else {
          series = (history.data ?? [])
            .map((d) => d.samples.find((x) => x.name === s.name)?.current)
            .filter((v): v is number => typeof v === "number");
          if (series.length === 0 || series[series.length - 1] !== s.current) series.push(s.current);
        }
        const proj = series.length >= 3 ? projectExhaustion(series, s.limit, 1) : null;
        return {
          name: s.name,
          label: s.label,
          region: s.region,
          current: s.current,
          limit: s.limit,
          util,
          etaDays: proj?.stepsToLimit != null ? Math.round(proj.stepsToLimit) : null,
          severity: proj?.severity ?? "ok",
          hasForecast: series.length >= 3,
        };
      })
      .sort((a, b) => {
        // Soonest exhaustion first, then highest utilisation.
        const ax = a.etaDays ?? Infinity;
        const bx = b.etaDays ?? Infinity;
        if (ax !== bx) return ax - bx;
        return b.util - a.util;
      });
  }, [samples, history.data, isDemo]);

  const nearLimit = rows.filter((r) => r.util >= 0.8).length;
  const criticalEta = rows.filter((r) => r.severity === "critical").length;
  const forecastReady = rows.some((r) => r.hasForecast);

  const columns: DataColumn<QuotaRow>[] = [
    { key: "label", header: "Quota", accessor: (r) => r.label, cell: (r) => <span className="font-medium">{r.label}</span> },
    { key: "region", header: "Region", accessor: (r) => r.region },
    {
      key: "util",
      header: "Usage",
      accessor: (r) => Math.round(r.util * 100),
      cell: (r) => (
        <div className="flex items-center gap-2">
          <div className="h-1.5 w-24 overflow-hidden rounded-full bg-muted">
            <div
              className={`h-full rounded-full ${r.util >= 0.9 ? "bg-destructive" : r.util >= 0.75 ? "bg-warning" : "bg-primary"}`}
              style={{ width: `${Math.min(100, Math.round(r.util * 100))}%` }}
            />
          </div>
          <span className="font-mono text-xs tabular-nums">
            {r.current}/{r.limit}
          </span>
        </div>
      ),
    },
    {
      key: "eta",
      header: "Projected exhaustion",
      accessor: (r) => (r.etaDays == null ? "" : r.etaDays),
      cell: (r) =>
        !r.hasForecast ? (
          <span className="text-xs text-muted-foreground">accruing…</span>
        ) : r.etaDays == null ? (
          <Badge variant="success">stable / declining</Badge>
        ) : r.severity === "critical" ? (
          <Badge variant="destructive">~{r.etaDays}d</Badge>
        ) : r.severity === "warning" ? (
          <Badge variant="warning">~{r.etaDays}d</Badge>
        ) : (
          <span className="text-xs">~{r.etaDays}d</span>
        ),
    },
  ];

  if (!activeId) return <NoSubscriptionState />;

  return (
    <>
      <PageHeader
        icon={<Gauge className="h-5 w-5" />}
        title="Quota Forecast"
        description={`Regional vCPU and network quota headroom for ${activeName ?? "this subscription"}${region ? ` · ${region}` : ""}, with robust exhaustion projection. Read-only.`}
        actions={
          <ExportButtons
            filenameBase="quota_forecast"
            title="Quota Exhaustion Forecast"
            subtitle={activeName ?? undefined}
            rows={rows}
            columns={[
              { header: "Quota", accessor: (r) => r.label },
              { header: "Region", accessor: (r) => r.region },
              { header: "Current", accessor: (r) => `${r.current}` },
              { header: "Limit", accessor: (r) => `${r.limit}` },
              { header: "Usage %", accessor: (r) => `${Math.round(r.util * 100)}` },
              { header: "ETA (days)", accessor: (r) => (r.etaDays == null ? "n/a" : `${r.etaDays}`) },
              { header: "Severity", accessor: (r) => r.severity },
            ]}
          />
        }
      />

      <AlgorithmBadge keys={["theilSen"]} />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Quotas tracked" value={rows.length} delta={region ?? undefined} loading={anyLoading} />
        <StatCard label="Near limit" value={nearLimit} delta="≥ 80% used" deltaTone={nearLimit > 0 ? "negative" : "positive"} loading={anyLoading} />
        <StatCard label="Critical ETA" value={criticalEta} delta="≤ 14 days" deltaTone={criticalEta > 0 ? "negative" : "positive"} loading={anyLoading} />
        <StatCard label="Forecast" value={forecastReady ? "active" : "accruing"} loading={anyLoading} />
      </div>

      {!forecastReady && !isDemo && (
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Forecast is accruing</AlertTitle>
          <AlertDescription>
            The exhaustion projection needs at least 3 days of recorded usage.
            Meridian records one usage sample per day per subscription in this
            browser (never on a server), so the ETA activates after a few visits.
            Current utilisation is shown immediately below.
          </AlertDescription>
        </Alert>
      )}

      <Alert>
        <Gauge className="h-4 w-4" />
        <AlertTitle>How the ETA is computed</AlertTitle>
        <AlertDescription>
          A Theil-Sen robust trend over daily usage projects when each quota
          reaches its limit, so a few spiky days can&apos;t skew the date. ≤ 14
          days is flagged critical, ≤ 45 days warning. Quota headroom is the most
          common cause of a blocked deployment.
        </AlertDescription>
      </Alert>

      <DataTable
        rows={rows}
        columns={columns}
        isLoading={anyLoading}
        searchPlaceholder="Filter by quota name…"
        emptyMessage={region ? "No quota usage returned for this region." : "Loading region…"}
        getRowId={(r) => r.name}
        pageSize={25}
      />
    </>
  );
}
