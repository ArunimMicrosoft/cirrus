"use client";

import { LayoutGrid } from "lucide-react";
import { PageHeader } from "@/components/data/PageHeader";
import { DataTable, type DataColumn } from "@/components/data/DataTable";
import { NoSubscriptionState } from "@/components/data/NoSubscriptionState";
import { ExportButtons } from "@/components/data/ExportButtons";
import { useArmList } from "@/lib/hooks/use-arm";
import { useSubscriptionStore } from "@/lib/hooks/use-subscription";
import { ArmApi } from "@/lib/azure/arm";
import type { ResourceGroup } from "@/lib/azure/types";
import { Badge } from "@/components/ui/badge";

const columns: DataColumn<ResourceGroup>[] = [
  {
    key: "name",
    header: "Name",
    accessor: (r) => r.name,
    cell: (r) => <span className="font-medium">{r.name}</span>,
  },
  { key: "location", header: "Location", accessor: (r) => r.location },
  {
    key: "state",
    header: "State",
    accessor: (r) => r.properties?.provisioningState ?? "-",
  },
  {
    key: "tags",
    header: "Tags",
    accessor: (r) => (r.tags ? Object.keys(r.tags).join(", ") : ""),
    cell: (r) => {
      const tags = r.tags ?? {};
      const keys = Object.keys(tags);
      if (keys.length === 0)
        return (
          <Badge variant="outline" className="text-muted-foreground">
            untagged
          </Badge>
        );
      return (
        <div className="flex flex-wrap gap-1">
          {keys.slice(0, 4).map((k) => (
            <Badge key={k} variant="secondary" className="text-[10px]">
              {k}={tags[k]}
            </Badge>
          ))}
          {keys.length > 4 && (
            <Badge variant="outline" className="text-[10px]">
              +{keys.length - 4}
            </Badge>
          )}
        </div>
      );
    },
  },
];

export default function ResourceGroupsPage() {
  const activeId = useSubscriptionStore((s) => s.activeId);
  const activeName = useSubscriptionStore((s) => s.activeName);
  const { data, isLoading, isError, error } = useArmList<ResourceGroup>(
    "/resourcegroups",
    ArmApi.resourceGroups,
  );

  const rows = data?.value ?? [];

  if (!activeId) return <NoSubscriptionState />;

  return (
    <>
      <PageHeader
        icon={<LayoutGrid className="h-5 w-5" />}
        title="Resource Groups"
        description={`Every resource group in ${activeName ?? "the selected subscription"}.`}
        actions={
          <ExportButtons
            filenameBase="resource_groups"
            title="Resource Groups Report"
            subtitle={activeName ?? undefined}
            rows={rows}
            columns={[
              { header: "Name", accessor: (r) => r.name },
              { header: "Location", accessor: (r) => r.location },
              {
                header: "State",
                accessor: (r) => r.properties?.provisioningState ?? "",
              },
              {
                header: "Tags",
                accessor: (r) =>
                  r.tags
                    ? Object.entries(r.tags)
                        .map(([k, v]) => `${k}=${v}`)
                        .join("; ")
                    : "",
              },
              { header: "ID", accessor: (r) => r.id },
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
        searchPlaceholder="Filter by name, location or tag…"
        emptyMessage="No resource groups found in this subscription."
        getRowId={(r) => r.id}
      />
    </>
  );
}
