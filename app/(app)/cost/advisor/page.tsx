"use client";

import { DollarSign, TrendingDown } from "lucide-react";
import { PageHeader } from "@/components/data/PageHeader";
import { DataTable, type DataColumn } from "@/components/data/DataTable";
import { NoSubscriptionState } from "@/components/data/NoSubscriptionState";
import { ExportButtons } from "@/components/data/ExportButtons";
import { StatCard } from "@/components/data/StatCard";
import { useArmList } from "@/lib/hooks/use-arm";
import { useSubscriptionStore } from "@/lib/hooks/use-subscription";
import { ArmApi } from "@/lib/azure/arm";
import type { AdvisorRecommendation } from "@/lib/azure/types";
import { Badge } from "@/components/ui/badge";

interface RecRow {
  id: string;
  category: string;
  impact: string;
  problem: string;
  solution: string;
  resource: string;
  updated: string;
}

function shortResource(resourceId: string | undefined): string {
  if (!resourceId) return "-";
  const parts = resourceId.split("/");
  return parts[parts.length - 1] ?? resourceId;
}

function toRow(r: AdvisorRecommendation): RecRow {
  const p = r.properties ?? {};
  return {
    id: r.id,
    category: p.category ?? "-",
    impact: p.impact ?? "-",
    problem: p.shortDescription?.problem ?? "",
    solution: p.shortDescription?.solution ?? "",
    resource: shortResource(p.resourceMetadata?.resourceId),
    updated: p.lastUpdated ?? "",
  };
}

const columns: DataColumn<RecRow>[] = [
  {
    key: "impact",
    header: "Impact",
    accessor: (r) => r.impact,
    cell: (r) => {
      const v = r.impact.toLowerCase();
      if (v === "high") return <Badge variant="destructive">High</Badge>;
      if (v === "medium") return <Badge variant="warning">Medium</Badge>;
      if (v === "low") return <Badge variant="secondary">Low</Badge>;
      return <Badge variant="outline">{r.impact}</Badge>;
    },
  },
  {
    key: "resource",
    header: "Resource",
    accessor: (r) => r.resource,
    cell: (r) => <span className="font-mono text-xs">{r.resource}</span>,
  },
  {
    key: "problem",
    header: "Problem",
    accessor: (r) => r.problem,
    cell: (r) => (
      <span className="line-clamp-2 text-sm" title={r.problem}>
        {r.problem}
      </span>
    ),
  },
  {
    key: "solution",
    header: "Recommendation",
    accessor: (r) => r.solution,
    cell: (r) => (
      <span className="line-clamp-2 text-sm text-muted-foreground" title={r.solution}>
        {r.solution}
      </span>
    ),
  },
];

export default function AdvisorPage() {
  const activeId = useSubscriptionStore((s) => s.activeId);
  const activeName = useSubscriptionStore((s) => s.activeName);
  // Advisor recommendations are subscription-scoped. Filter to Cost category server-side.
  const { data, isLoading, isError, error } = useArmList<AdvisorRecommendation>(
    "/providers/Microsoft.Advisor/recommendations",
    ArmApi.advisor,
  );

  const rows = (data?.value ?? [])
    .map(toRow)
    .filter((r) => r.category.toLowerCase() === "cost");

  const high = rows.filter((r) => r.impact.toLowerCase() === "high").length;
  const medium = rows.filter((r) => r.impact.toLowerCase() === "medium").length;
  const low = rows.filter((r) => r.impact.toLowerCase() === "low").length;

  if (!activeId) return <NoSubscriptionState />;

  return (
    <>
      <PageHeader
        icon={<DollarSign className="h-5 w-5" />}
        title="Azure Advisor · Cost"
        description={`Cost optimization recommendations for ${activeName ?? "the selected subscription"}.`}
        actions={
          <ExportButtons
            filenameBase="advisor_cost"
            title="Azure Advisor Cost Recommendations"
            subtitle={activeName ?? undefined}
            rows={rows}
            columns={[
              { header: "Impact", accessor: (r) => r.impact },
              { header: "Resource", accessor: (r) => r.resource },
              { header: "Problem", accessor: (r) => r.problem },
              { header: "Solution", accessor: (r) => r.solution },
              { header: "Last Updated", accessor: (r) => r.updated },
            ]}
          />
        }
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard
          label="Total"
          value={rows.length}
          icon={<TrendingDown className="h-4 w-4" />}
          loading={isLoading}
        />
        <StatCard label="High Impact" value={high} loading={isLoading} />
        <StatCard label="Medium Impact" value={medium} loading={isLoading} />
        <StatCard label="Low Impact" value={low} loading={isLoading} />
      </div>

      <DataTable
        rows={rows}
        columns={columns}
        isLoading={isLoading}
        isError={isError}
        error={error}
        searchPlaceholder="Filter by resource or description…"
        emptyMessage="No cost recommendations from Azure Advisor. Nice work."
        getRowId={(r) => r.id}
      />
    </>
  );
}
