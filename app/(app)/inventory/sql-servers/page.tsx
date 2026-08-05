"use client";

import { Database } from "lucide-react";
import { PageHeader } from "@/components/data/PageHeader";
import { DataTable, type DataColumn } from "@/components/data/DataTable";
import { NoSubscriptionState } from "@/components/data/NoSubscriptionState";
import { ExportButtons } from "@/components/data/ExportButtons";
import { useArmList } from "@/lib/hooks/use-arm";
import { useSubscriptionStore } from "@/lib/hooks/use-subscription";
import { ArmApi } from "@/lib/azure/arm";
import type { SqlServer } from "@/lib/azure/types";
import { resourceGroupFromId } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

interface SqlRow {
  id: string;
  name: string;
  resourceGroup: string;
  region: string;
  version: string;
  state: string;
  fqdn: string;
}

function toRow(s: SqlServer): SqlRow {
  return {
    id: s.id,
    name: s.name,
    resourceGroup: resourceGroupFromId(s.id),
    region: s.location,
    version: s.properties?.version ?? "-",
    state: s.properties?.state ?? "-",
    fqdn: s.properties?.fullyQualifiedDomainName ?? "-",
  };
}

const columns: DataColumn<SqlRow>[] = [
  {
    key: "name",
    header: "Server",
    accessor: (r) => r.name,
    cell: (r) => <span className="font-medium">{r.name}</span>,
  },
  { key: "rg", header: "Resource Group", accessor: (r) => r.resourceGroup },
  { key: "region", header: "Region", accessor: (r) => r.region },
  {
    key: "version",
    header: "Version",
    accessor: (r) => r.version,
    cell: (r) => <Badge variant="secondary">v{r.version}</Badge>,
  },
  {
    key: "state",
    header: "State",
    accessor: (r) => r.state,
    cell: (r) =>
      r.state.toLowerCase() === "ready" ? (
        <Badge variant="success">Ready</Badge>
      ) : (
        <Badge variant="outline">{r.state}</Badge>
      ),
  },
  {
    key: "fqdn",
    header: "FQDN",
    accessor: (r) => r.fqdn,
    cell: (r) => <span className="font-mono text-xs">{r.fqdn}</span>,
  },
];

export default function SqlServersPage() {
  const activeId = useSubscriptionStore((s) => s.activeId);
  const activeName = useSubscriptionStore((s) => s.activeName);
  const { data, isLoading, isError, error } = useArmList<SqlServer>(
    "/providers/Microsoft.Sql/servers",
    ArmApi.sql,
  );

  const rows = (data?.value ?? []).map(toRow);

  if (!activeId) return <NoSubscriptionState />;

  return (
    <>
      <PageHeader
        icon={<Database className="h-5 w-5" />}
        title="SQL Servers"
        description={`Azure SQL logical servers in ${activeName ?? "the selected subscription"}.`}
        actions={
          <ExportButtons
            filenameBase="sql_servers"
            title="SQL Servers Report"
            subtitle={activeName ?? undefined}
            rows={rows}
            columns={[
              { header: "Server", accessor: (r) => r.name },
              { header: "Resource Group", accessor: (r) => r.resourceGroup },
              { header: "Region", accessor: (r) => r.region },
              { header: "Version", accessor: (r) => r.version },
              { header: "State", accessor: (r) => r.state },
              { header: "FQDN", accessor: (r) => r.fqdn },
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
        searchPlaceholder="Filter by server name or FQDN…"
        emptyMessage="No SQL servers found in this subscription."
        getRowId={(r) => r.id}
      />
    </>
  );
}
