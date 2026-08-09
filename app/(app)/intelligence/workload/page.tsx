"use client";

import * as React from "react";
import { useQueries } from "@tanstack/react-query";
import { Boxes, Activity, GitCommitHorizontal } from "lucide-react";
import { PageHeader } from "@/components/data/PageHeader";
import { NoSubscriptionState } from "@/components/data/NoSubscriptionState";
import { StatCard } from "@/components/data/StatCard";
import { AlgorithmBadge } from "@/components/data/AlgorithmBadge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useArmList } from "@/lib/hooks/use-arm";
import { useSubscriptionStore } from "@/lib/hooks/use-subscription";
import { ArmApi } from "@/lib/azure/arm";
import { api } from "@/lib/api-client";
import { resourceGroupFromId } from "@/lib/utils";
import {
  extractFeatures,
  clusterWorkloads,
  labelArchetype,
  FEATURE_KEYS,
  type WorkloadFeatures,
} from "@/lib/ml/cluster";
import { sizingVerdict, type SizingVerdict } from "@/lib/ml/rightsizing-stats";
import { cusum, pelt, type ChangePoint } from "@/lib/ml/changepoint";
import type { VirtualMachine } from "@/lib/azure/types";

interface MetricResponse {
  value: Array<{ timeseries: Array<{ data: Array<{ timeStamp: string; average?: number; maximum?: number }> }> }>;
}

interface VmAnalysis {
  vm: VirtualMachine;
  values: number[];
  timestamps: string[];
  features: WorkloadFeatures | null;
  sizing: SizingVerdict;
  changepoint: ChangePoint | null;
  /** PELT multi-changepoint segmentation of the same CPU series. */
  regimes: ChangePoint[];
}

export default function WorkloadIntelligencePage() {
  const activeId = useSubscriptionStore((s) => s.activeId);
  const activeName = useSubscriptionStore((s) => s.activeName);

  const vms = useArmList<VirtualMachine>(
    "/providers/Microsoft.Compute/virtualMachines",
    ArmApi.computeVms,
  );
  const vmList = vms.data?.value ?? [];

  // Fan out 14 days of hourly CPU for each VM (all GET, read-only).
  const metricQueries = useQueries({
    queries: vmList.map((vm) => ({
      queryKey: ["workload-cpu", activeId, vm.id],
      queryFn: async (): Promise<MetricResponse> => {
        if (!activeId) throw new Error("No active subscription");
        const rg = resourceGroupFromId(vm.id);
        const end = new Date();
        const start = new Date(end.getTime() - 14 * 24 * 60 * 60 * 1000);
        const timespan = `${start.toISOString()}/${end.toISOString()}`;
        const path =
          `/resourceGroups/${encodeURIComponent(rg)}` +
          `/providers/Microsoft.Compute/virtualMachines/${encodeURIComponent(vm.name)}` +
          `/providers/Microsoft.Insights/metrics`;
        // Query params go through api.arm's params arg so it produces ONE
        // query string (with api-version). Baking them into the path breaks
        // the URL with a second "?" and the proxy rejects it.
        return api.arm<MetricResponse>(activeId, path, ArmApi.monitorMetrics, {
          metricnames: "Percentage CPU",
          aggregation: "Average,Maximum",
          timespan,
          interval: "PT1H",
        });
      },
      enabled: Boolean(activeId),
      staleTime: 10 * 60_000,
      retry: false,
    })),
  });

  const analyses: VmAnalysis[] = React.useMemo(() => {
    return vmList.map((vm, i) => {
      const q = metricQueries[i];
      const points = q?.data?.value?.[0]?.timeseries?.[0]?.data ?? [];
      const values = points.map((p) => (typeof p.average === "number" ? p.average : p.maximum ?? NaN));
      const timestamps = points.map((p) => p.timeStamp);
      const features = extractFeatures(values, timestamps);
      const sizing = sizingVerdict(values);
      const changepoint = cusum(values);
      const regimes = pelt(values, timestamps);
      return { vm, values, timestamps, features, sizing, changepoint, regimes };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vmList, metricQueries.map((q) => q.dataUpdatedAt).join(",")]);

  const metricsLoading = metricQueries.some((q) => q.isLoading);

  // ---- Clustering over VMs with usable features ----
  const withFeatures = analyses.filter((a) => a.features);
  const clustering = React.useMemo(() => {
    if (withFeatures.length < 4) return null;
    const rows = withFeatures.map((a) =>
      FEATURE_KEYS.map((k) => (a.features as WorkloadFeatures)[k]),
    );
    return clusterWorkloads(rows);
  }, [withFeatures]);

  // Archetype label per cluster centroid.
  const clusterLabels = React.useMemo(() => {
    if (!clustering) return [];
    return clustering.centroidsRaw.map((c) => {
      const f: WorkloadFeatures = {
        mean: c[0], std: c[1], p95: c[2], burstiness: c[3], idleFraction: c[4], diurnalAmplitude: c[5],
      };
      return labelArchetype(f);
    });
  }, [clustering]);

  const downsizable = analyses.filter((a) => a.sizing.action === "downsize").length;
  const changepoints = analyses.filter((a) => a.changepoint).length;

  if (!activeId) return <NoSubscriptionState />;

  return (
    <>
      <PageHeader
        icon={<Boxes className="h-5 w-5" />}
        title="Workload Intelligence"
        description={`Unsupervised clustering, distribution-based right-sizing, and changepoint detection over 14 days of CPU for ${activeName ?? "this subscription"}. Read-only.`}
      />

      <AlgorithmBadge keys={["kMeans", "distributionSizing", "cusum", "pelt"]} />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="VMs analysed" value={withFeatures.length} loading={vms.isLoading || metricsLoading} />
        <StatCard
          label="Workload archetypes"
          value={clustering?.k ?? "—"}
          delta={clustering ? `silhouette ${clustering.silhouette.toFixed(2)}` : undefined}
          loading={metricsLoading}
        />
        <StatCard
          label="Safe to downsize"
          value={downsizable}
          delta="p99 + headroom fits"
          deltaTone={downsizable > 0 ? "positive" : "default"}
          loading={metricsLoading}
        />
        <StatCard
          label="Regime shifts"
          value={changepoints}
          delta="baseline stepped"
          deltaTone={changepoints > 0 ? "negative" : "default"}
          loading={metricsLoading}
        />
      </div>

      <Alert>
        <Activity className="h-4 w-4" />
        <AlertTitle>Real unsupervised ML, in your browser</AlertTitle>
        <AlertDescription>
          Each VM is turned into a behaviour vector (mean, variance, p95,
          burstiness, idle fraction, diurnal amplitude) and grouped with
          k-means++ (auto-k by silhouette). Sizing models the full CPU
          distribution and estimates throttle risk if downsized. Changepoints
          come from a CUSUM control chart, with PELT exact segmentation flagging
          multi-step regime changes. No external AI, nothing leaves the tenant.
        </AlertDescription>
      </Alert>

      {/* Clusters */}
      {clustering && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-semibold">
              <Boxes className="h-4 w-4 text-primary" />
              Workload archetypes ({clustering.k})
            </CardTitle>
          </CardHeader>
          <CardContent className="pb-4">
            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: clustering.k }).map((_, ci) => {
                const members = withFeatures.filter((_, i) => clustering.assignments[i] === ci);
                const lbl = clusterLabels[ci];
                if (members.length === 0) return null;
                return (
                  <div key={ci} className="rounded-md border bg-card/60 p-3">
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary">{lbl?.label ?? `Cluster ${ci + 1}`}</Badge>
                      <span className="ml-auto text-[11px] text-muted-foreground">{members.length} VMs</span>
                    </div>
                    <p className="mt-1.5 text-xs text-muted-foreground">{lbl?.hint}</p>
                    <div className="mt-2 flex flex-wrap gap-1">
                      {members.slice(0, 8).map((m) => (
                        <span key={m.vm.id} className="rounded border bg-muted/60 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                          {m.vm.name}
                        </span>
                      ))}
                      {members.length > 8 && (
                        <span className="text-[10px] text-muted-foreground">+{members.length - 8}</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Right-sizing + changepoints table */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm font-semibold">
            <GitCommitHorizontal className="h-4 w-4 text-primary" />
            Per-VM sizing verdict &amp; regime shifts
          </CardTitle>
        </CardHeader>
        <CardContent className="pb-4">
          {metricsLoading ? (
            <p className="text-sm text-muted-foreground">Fetching 14-day CPU for {vmList.length} VMs…</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-sm">
                <thead className="border-b text-[11px] uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="px-2 py-1.5 text-left">VM</th>
                    <th className="px-2 py-1.5 text-left">Verdict</th>
                    <th className="px-2 py-1.5 text-right">p99 CPU</th>
                    <th className="px-2 py-1.5 text-right">Throttle risk if −1</th>
                    <th className="px-2 py-1.5 text-right">Confidence</th>
                    <th className="px-2 py-1.5 text-left">Regime shift</th>
                  </tr>
                </thead>
                <tbody>
                  {analyses.map((a) => (
                    <tr key={a.vm.id} className="border-b last:border-0">
                      <td className="px-2 py-1.5 font-medium">{a.vm.name}</td>
                      <td className="px-2 py-1.5">
                        {a.sizing.action === "downsize" && <Badge variant="success">Downsize</Badge>}
                        {a.sizing.action === "upsize" && <Badge variant="destructive">Upsize</Badge>}
                        {a.sizing.action === "keep" && <Badge variant="outline">Keep</Badge>}
                        {a.sizing.action === "insufficient-data" && <Badge variant="secondary">No data</Badge>}
                      </td>
                      <td className="px-2 py-1.5 text-right tabular-nums">
                        {a.sizing.action === "insufficient-data" ? "—" : `${a.sizing.p99.toFixed(0)}%`}
                      </td>
                      <td className="px-2 py-1.5 text-right tabular-nums">
                        {a.sizing.action === "insufficient-data" ? "—" : `${(a.sizing.throttleRisk * 100).toFixed(0)}%`}
                      </td>
                      <td className="px-2 py-1.5 text-right tabular-nums text-muted-foreground">
                        {a.sizing.action === "insufficient-data" ? "—" : `${(a.sizing.confidence * 100).toFixed(0)}%`}
                      </td>
                      <td className="px-2 py-1.5">
                        {a.changepoint ? (
                          <span className="font-mono text-[11px] text-warning">
                            {a.changepoint.direction === "up" ? "↑" : "↓"} {a.changepoint.before.toFixed(0)}→{a.changepoint.after.toFixed(0)}%
                            {a.changepoint.time ? ` · ${new Date(a.changepoint.time).toLocaleDateString()}` : ""}
                            {a.regimes.length > 1 && (
                              <span className="text-muted-foreground"> · {a.regimes.length + 1} regimes</span>
                            )}
                          </span>
                        ) : a.regimes.length > 0 ? (
                          <span className="font-mono text-[11px] text-warning">
                            {a.regimes.length + 1} regimes (PELT)
                          </span>
                        ) : (
                          <span className="text-[11px] text-muted-foreground">stable</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </>
  );
}
