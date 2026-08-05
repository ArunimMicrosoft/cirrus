"use client";

import * as React from "react";
import { AlertTriangle } from "lucide-react";
import { PageHeader } from "@/components/data/PageHeader";
import { DataTable, type DataColumn } from "@/components/data/DataTable";
import { NoSubscriptionState } from "@/components/data/NoSubscriptionState";
import { ExportButtons } from "@/components/data/ExportButtons";
import { StatCard } from "@/components/data/StatCard";
import { useArmList } from "@/lib/hooks/use-arm";
import { useSubscriptionStore } from "@/lib/hooks/use-subscription";
import { ArmApi } from "@/lib/azure/arm";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface ActivityLogEvent {
  eventTimestamp?: string;
  eventName?: { value?: string; localizedValue?: string };
  operationName?: { value?: string; localizedValue?: string };
  status?: { value?: string; localizedValue?: string };
  level?: string;
  resourceGroupName?: string;
  resourceType?: { value?: string };
  caller?: string;
  resourceId?: string;
}

interface Row {
  id: string;
  time: string;
  event: string;
  operation: string;
  status: string;
  level: string;
  resourceGroup: string;
  caller: string;
}

function toRow(e: ActivityLogEvent, i: number): Row {
  return {
    id: `${e.eventTimestamp ?? ""}-${i}`,
    time: e.eventTimestamp ? new Date(e.eventTimestamp).toLocaleString() : "-",
    event: e.eventName?.localizedValue ?? e.eventName?.value ?? "-",
    operation:
      e.operationName?.localizedValue ?? e.operationName?.value ?? "-",
    status: e.status?.localizedValue ?? e.status?.value ?? "-",
    level: e.level ?? "-",
    resourceGroup: e.resourceGroupName ?? "-",
    caller: e.caller ?? "-",
  };
}

const columns: DataColumn<Row>[] = [
  {
    key: "time",
    header: "Time",
    accessor: (r) => r.time,
    cell: (r) => <span className="whitespace-nowrap text-xs tabular-nums">{r.time}</span>,
  },
  {
    key: "level",
    header: "Level",
    accessor: (r) => r.level,
    cell: (r) => {
      const l = r.level.toLowerCase();
      if (l === "critical" || l === "error")
        return <Badge variant="destructive">{r.level}</Badge>;
      if (l === "warning") return <Badge variant="warning">{r.level}</Badge>;
      if (l === "informational") return <Badge variant="secondary">Info</Badge>;
      return <Badge variant="outline">{r.level}</Badge>;
    },
  },
  {
    key: "status",
    header: "Status",
    accessor: (r) => r.status,
    cell: (r) => {
      const s = r.status.toLowerCase();
      if (s === "succeeded" || s === "success")
        return <Badge variant="success">Success</Badge>;
      if (s === "failed") return <Badge variant="destructive">Failed</Badge>;
      if (s === "started") return <Badge variant="secondary">Started</Badge>;
      return <Badge variant="outline">{r.status}</Badge>;
    },
  },
  {
    key: "operation",
    header: "Operation",
    accessor: (r) => r.operation,
    cell: (r) => (
      <span className="line-clamp-1 text-xs" title={r.operation}>
        {r.operation}
      </span>
    ),
  },
  { key: "rg", header: "Resource Group", accessor: (r) => r.resourceGroup },
  {
    key: "caller",
    header: "Caller",
    accessor: (r) => r.caller,
    cell: (r) => (
      <span className="line-clamp-1 text-xs font-mono" title={r.caller}>
        {r.caller}
      </span>
    ),
  },
];

export default function AlertsPage() {
  const activeId = useSubscriptionStore((s) => s.activeId);
  const activeName = useSubscriptionStore((s) => s.activeName);

  const [windowDays, setWindowDays] = React.useState<"1" | "7" | "30">("7");

  const start = React.useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - Number(windowDays));
    return d.toISOString();
  }, [windowDays]);

  // Activity log endpoint requires a $filter for eventTimestamp.
  // The ARM proxy passes query params through untouched.
  const filter = `eventTimestamp ge '${start}'`;

  const { data, isLoading, isError, error } = useArmList<ActivityLogEvent>(
    `/providers/Microsoft.Insights/eventtypes/management/values`,
    ArmApi.monitorActivityLog,
    {
      queryKey: ["activity-log", activeId, windowDays],
      // Custom queryKey to bust cache when window changes.
    },
  );

  // ARM's activity log accepts $filter but not through our proxy's forwarding
  // yet — pass via query param directly through the api client would need
  // update. For Phase 5 we filter client-side over the returned window.
  const cutoff = Date.parse(start);
  const events = (data?.value ?? []).filter((e) => {
    const t = e.eventTimestamp ? Date.parse(e.eventTimestamp) : NaN;
    return !Number.isFinite(t) || t >= cutoff;
  });

  const rows = events.slice(0, 500).map(toRow);
  const failed = rows.filter((r) => r.status.toLowerCase() === "failed").length;
  const warnings = rows.filter((r) => r.level.toLowerCase() === "warning").length;
  const critical = rows.filter(
    (r) => r.level.toLowerCase() === "critical" || r.level.toLowerCase() === "error",
  ).length;

  if (!activeId) return <NoSubscriptionState />;
  void filter; // reserved for future server-side push

  return (
    <>
      <PageHeader
        icon={<AlertTriangle className="h-5 w-5" />}
        title="Azure Monitor Alerts"
        description={`Activity log events for ${activeName ?? "this subscription"}. Read-only view of the audit trail.`}
        actions={
          <div className="flex items-center gap-2">
            <Select
              value={windowDays}
              onValueChange={(v: "1" | "7" | "30") => setWindowDays(v)}
            >
              <SelectTrigger className="w-36">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1">Last 24 hours</SelectItem>
                <SelectItem value="7">Last 7 days</SelectItem>
                <SelectItem value="30">Last 30 days</SelectItem>
              </SelectContent>
            </Select>
            <ExportButtons
              filenameBase="activity_log"
              title="Azure Activity Log"
              subtitle={activeName ?? undefined}
              rows={rows}
              columns={[
                { header: "Time", accessor: (r) => r.time },
                { header: "Level", accessor: (r) => r.level },
                { header: "Status", accessor: (r) => r.status },
                { header: "Event", accessor: (r) => r.event },
                { header: "Operation", accessor: (r) => r.operation },
                { header: "Resource Group", accessor: (r) => r.resourceGroup },
                { header: "Caller", accessor: (r) => r.caller },
              ]}
            />
          </div>
        }
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Events shown" value={rows.length} loading={isLoading} />
        <StatCard
          label="Critical/Error"
          value={critical}
          deltaTone={critical > 0 ? "negative" : "positive"}
          loading={isLoading}
        />
        <StatCard
          label="Warnings"
          value={warnings}
          deltaTone={warnings > 0 ? "negative" : "default"}
          loading={isLoading}
        />
        <StatCard
          label="Failed operations"
          value={failed}
          deltaTone={failed > 0 ? "negative" : "positive"}
          loading={isLoading}
        />
      </div>

      <DataTable
        rows={rows}
        columns={columns}
        isLoading={isLoading}
        isError={isError}
        error={error}
        searchPlaceholder="Filter by operation, resource group, caller…"
        emptyMessage="No activity log events in the selected window."
        pageSize={30}
        getRowId={(r) => r.id}
      />
    </>
  );
}
