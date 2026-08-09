"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import {
  LineChart as LineChartIcon,
  Radio,
} from "lucide-react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { PageHeader } from "@/components/data/PageHeader";
import { NoSubscriptionState } from "@/components/data/NoSubscriptionState";
import { ExportButtons } from "@/components/data/ExportButtons";
import { StatCard } from "@/components/data/StatCard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useArmList } from "@/lib/hooks/use-arm";
import { useSubscriptionStore } from "@/lib/hooks/use-subscription";
import { ArmApi } from "@/lib/azure/arm";
import { api } from "@/lib/api-client";
import { resourceGroupFromId } from "@/lib/utils";
import type { VirtualMachine } from "@/lib/azure/types";

const WINDOWS = {
  "1h": { hours: 1, interval: "PT1M", label: "Last 1 hour · 1-min" },
  "24h": { hours: 24, interval: "PT15M", label: "Last 24 hours · 15-min" },
  "7d": { hours: 24 * 7, interval: "PT1H", label: "Last 7 days · 1-hr" },
  "30d": { hours: 24 * 30, interval: "PT6H", label: "Last 30 days · 6-hr" },
} as const;

type WindowKey = keyof typeof WINDOWS;

const VM_METRICS: Array<{ name: string; label: string; unit: string }> = [
  { name: "Percentage CPU", label: "CPU %", unit: "%" },
  { name: "Available Memory Bytes", label: "Available Memory", unit: "bytes" },
  { name: "Network In Total", label: "Network In", unit: "bytes" },
  { name: "Network Out Total", label: "Network Out", unit: "bytes" },
  { name: "Disk Read Bytes", label: "Disk Read", unit: "bytes/s" },
  { name: "Disk Write Bytes", label: "Disk Write", unit: "bytes/s" },
];

interface MetricValue {
  timeStamp: string;
  average?: number;
  total?: number;
  maximum?: number;
  minimum?: number;
}

interface MetricResponse {
  value: Array<{
    name: { value: string; localizedValue?: string };
    unit: string;
    timeseries: Array<{ data: MetricValue[] }>;
  }>;
}

export default function MetricsPage() {
  const activeId = useSubscriptionStore((s) => s.activeId);
  const activeName = useSubscriptionStore((s) => s.activeName);

  const vms = useArmList<VirtualMachine>(
    "/providers/Microsoft.Compute/virtualMachines",
    ArmApi.computeVms,
  );
  const vmList = vms.data?.value ?? [];

  const [selectedVm, setSelectedVm] = React.useState<string>("");
  const [selectedMetric, setSelectedMetric] = React.useState<string>("Percentage CPU");
  const [windowKey, setWindowKey] = React.useState<WindowKey>("24h");

  React.useEffect(() => {
    if (vmList.length > 0 && !selectedVm) setSelectedVm(vmList[0].name);
  }, [vmList, selectedVm]);

  const vm = vmList.find((v) => v.name === selectedVm);

  const { data: metrics, isLoading, isError, error } = useQuery<MetricResponse>({
    queryKey: ["metrics", activeId, selectedVm, selectedMetric, windowKey],
    queryFn: async () => {
      if (!vm || !activeId) throw new Error("No VM selected");
      const rg = resourceGroupFromId(vm.id);
      const { hours, interval } = WINDOWS[windowKey];
      const end = new Date();
      const start = new Date(end.getTime() - hours * 60 * 60 * 1000);
      const timespan = `${start.toISOString()}/${end.toISOString()}`;
      const path =
        `/resourceGroups/${encodeURIComponent(rg)}` +
        `/providers/Microsoft.Compute/virtualMachines/${encodeURIComponent(vm.name)}` +
        `/providers/Microsoft.Insights/metrics`;
      // Params via api.arm's params arg — baking a query string into the path
      // produces a second "?" and the proxy rejects the request.
      return api.arm<MetricResponse>(activeId, path, ArmApi.monitorMetrics, {
        metricnames: selectedMetric,
        aggregation: "Average",
        timespan,
        interval,
      });
    },
    enabled: Boolean(activeId && vm),
    staleTime: 60_000,
    retry: false,
  });

  const series = metrics?.value[0];
  const unit = series?.unit ?? VM_METRICS.find((m) => m.name === selectedMetric)?.unit ?? "";
  const data = (series?.timeseries[0]?.data ?? []).map((p) => ({
    time: new Date(p.timeStamp).toLocaleString(),
    ts: p.timeStamp,
    value: p.average ?? 0,
  }));

  const values = data.map((d) => d.value).filter((v) => Number.isFinite(v));
  const min = values.length > 0 ? Math.min(...values) : 0;
  const max = values.length > 0 ? Math.max(...values) : 0;
  const avg =
    values.length > 0 ? values.reduce((s, v) => s + v, 0) / values.length : 0;

  const fmtY = (v: number) => {
    if (unit === "bytes") {
      if (v > 1e9) return `${(v / 1e9).toFixed(1)}G`;
      if (v > 1e6) return `${(v / 1e6).toFixed(1)}M`;
      if (v > 1e3) return `${(v / 1e3).toFixed(1)}K`;
      return v.toFixed(0);
    }
    if (unit === "Percent" || unit === "%") return `${v.toFixed(1)}%`;
    return v.toFixed(2);
  };

  if (!activeId) return <NoSubscriptionState />;

  return (
    <>
      <PageHeader
        icon={<LineChartIcon className="h-5 w-5" />}
        title="Azure Monitor Metrics"
        description={`Time-series metrics for VMs in ${activeName ?? "this subscription"}.`}
        actions={
          data.length > 0 && (
            <ExportButtons
              filenameBase={`metrics_${selectedVm}_${selectedMetric.replace(/\s+/g, "_")}`}
              title={`${selectedVm} · ${selectedMetric}`}
              rows={data}
              columns={[
                { header: "Timestamp", accessor: (r) => r.ts },
                { header: "Time (local)", accessor: (r) => r.time },
                { header: `Value (${unit})`, accessor: (r) => r.value.toFixed(4) },
              ]}
            />
          )
        }
      />

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Query</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-3">
          <div>
            <Label className="mb-1 block text-xs">Virtual Machine</Label>
            <Select value={selectedVm} onValueChange={setSelectedVm}>
              <SelectTrigger>
                <SelectValue placeholder={vms.isLoading ? "Loading…" : "Select VM"} />
              </SelectTrigger>
              <SelectContent>
                {vmList.map((v) => (
                  <SelectItem key={v.id} value={v.name}>
                    {v.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="mb-1 block text-xs">Metric</Label>
            <Select value={selectedMetric} onValueChange={setSelectedMetric}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {VM_METRICS.map((m) => (
                  <SelectItem key={m.name} value={m.name}>
                    {m.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="mb-1 block text-xs">Time window</Label>
            <Select
              value={windowKey}
              onValueChange={(v: WindowKey) => setWindowKey(v)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(WINDOWS) as WindowKey[]).map((k) => (
                  <SelectItem key={k} value={k}>
                    {WINDOWS[k].label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {isError && (
        <Alert variant="destructive">
          <AlertTitle>Metric fetch failed</AlertTitle>
          <AlertDescription>
            {error instanceof Error ? error.message : String(error)} · Ensure the
            SP has the "Monitoring Reader" role.
          </AlertDescription>
        </Alert>
      )}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Datapoints" value={data.length} loading={isLoading} />
        <StatCard label={`Min (${unit})`} value={min ? fmtY(min) : "—"} loading={isLoading} />
        <StatCard label={`Avg (${unit})`} value={values.length > 0 ? fmtY(avg) : "—"} loading={isLoading} />
        <StatCard label={`Max (${unit})`} value={max ? fmtY(max) : "—"} loading={isLoading} />
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm">
            <Radio className="h-4 w-4 text-primary" />
            {selectedMetric}
            <span className="text-muted-foreground">· {unit}</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="h-[360px]">
          {isLoading ? (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              Loading metrics…
            </div>
          ) : data.length === 0 ? (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              No datapoints returned. VM may be deallocated, metric may not be emitted, or Monitoring Reader role may be missing.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis
                  dataKey="time"
                  tick={{ fontSize: 10 }}
                  minTickGap={40}
                  stroke="hsl(var(--muted-foreground))"
                />
                <YAxis
                  tick={{ fontSize: 10 }}
                  tickFormatter={fmtY}
                  stroke="hsl(var(--muted-foreground))"
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    fontSize: 12,
                    borderRadius: 6,
                  }}
                  formatter={(v: number) => [fmtY(v), selectedMetric]}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Line
                  type="monotone"
                  dataKey="value"
                  name={selectedMetric}
                  stroke="hsl(var(--primary))"
                  strokeWidth={2}
                  dot={false}
                  isAnimationActive={false}
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>
    </>
  );
}
