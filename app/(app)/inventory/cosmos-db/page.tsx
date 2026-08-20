"use client";

import { Globe } from "lucide-react";
import { PageHeader } from "@/components/data/PageHeader";
import { DataTable, type DataColumn } from "@/components/data/DataTable";
import { NoSubscriptionState } from "@/components/data/NoSubscriptionState";
import { ExportButtons } from "@/components/data/ExportButtons";
import { useArmList } from "@/lib/hooks/use-arm";
import { useSubscriptionStore } from "@/lib/hooks/use-subscription";
import { ArmApi } from "@/lib/azure/arm";
import type { CosmosAccount } from "@/lib/azure/types";
import { resourceGroupFromId } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

interface CosmosRow {
  id: string;
  name: string;
  resourceGroup: string;
  api: string;
  consistency: string;
  regions: number;
  multiWrite: boolean;
  autoFailover: boolean;
  publicAccess: boolean;
  freeTier: boolean;
  singleRegion: boolean;
}

/** Map kind + capabilities to the user-facing API surface. */
function apiOf(c: CosmosAccount): string {
  const caps = (c.properties?.capabilities ?? []).map((x) => x.name ?? "");
  if (caps.includes("EnableCassandra")) return "Cassandra";
  if (caps.includes("EnableGremlin")) return "Gremlin";
  if (caps.includes("EnableTable")) return "Table";
  if (c.kind === "MongoDB" || caps.includes("EnableMongo")) return "MongoDB";
  return "Core (SQL)";
}

function toRow(c: CosmosAccount): CosmosRow {
  const p = c.properties ?? {};
  const regions = (p.locations ?? []).length || 1;
  return {
    id: c.id,
    name: c.name,
    resourceGroup: resourceGroupFromId(c.id),
    api: apiOf(c),
    consistency: p.consistencyPolicy?.defaultConsistencyLevel ?? "—",
    regions,
    multiWrite: Boolean(p.enableMultipleWriteLocations),
    autoFailover: Boolean(p.enableAutomaticFailover),
    publicAccess: (p.publicNetworkAccess ?? "Enabled") === "Enabled",
    freeTier: Boolean(p.enableFreeTier),
    singleRegion: regions < 2,
  };
}

const columns: DataColumn<CosmosRow>[] = [
  { key: "name", header: "Name", accessor: (r) => r.name, cell: (r) => <span className="font-medium">{r.name}</span> },
  { key: "rg", header: "Resource Group", accessor: (r) => r.resourceGroup },
  { key: "api", header: "API", accessor: (r) => r.api, cell: (r) => <Badge variant="secondary">{r.api}</Badge> },
  { key: "consistency", header: "Consistency", accessor: (r) => r.consistency },
  {
    key: "regions",
    header: "Regions",
    accessor: (r) => r.regions,
    cell: (r) => (r.singleRegion ? <Badge variant="warning">1 · no geo-redundancy</Badge> : <span className="text-xs">{r.regions}</span>),
  },
  {
    key: "write",
    header: "Multi-region write",
    accessor: (r) => (r.multiWrite ? "yes" : "no"),
    cell: (r) => <span className="text-xs">{r.multiWrite ? "yes" : "no"}</span>,
  },
  {
    key: "failover",
    header: "Auto-failover",
    accessor: (r) => (r.autoFailover ? "on" : "off"),
    cell: (r) =>
      !r.autoFailover && !r.singleRegion ? <Badge variant="warning">Off</Badge> : <span className="text-xs">{r.autoFailover ? "on" : "—"}</span>,
  },
  {
    key: "public",
    header: "Public access",
    accessor: (r) => (r.publicAccess ? "Enabled" : "Disabled"),
    cell: (r) => (r.publicAccess ? <Badge variant="warning">Enabled</Badge> : <Badge variant="success">Disabled</Badge>),
  },
];

export default function CosmosDbPage() {
  const activeId = useSubscriptionStore((s) => s.activeId);
  const activeName = useSubscriptionStore((s) => s.activeName);
  const { data, isLoading, isError, error } = useArmList<CosmosAccount>(
    "/providers/Microsoft.DocumentDB/databaseAccounts",
    ArmApi.documentDB,
  );

  const rows = (data?.value ?? []).map(toRow);
  const publicAcct = rows.filter((r) => r.publicAccess).length;
  const singleRegion = rows.filter((r) => r.singleRegion).length;
  const noFailover = rows.filter((r) => !r.autoFailover && !r.singleRegion).length;

  const description =
    rows.length === 0
      ? `No Cosmos DB accounts found in ${activeName ?? "the selected subscription"}.`
      : [
          `${rows.length} account${rows.length === 1 ? "" : "s"}`,
          publicAcct > 0 ? `${publicAcct} with public network access` : "all private",
          singleRegion > 0 ? `${singleRegion} single-region` : null,
          noFailover > 0 ? `${noFailover} multi-region without auto-failover` : null,
        ]
          .filter(Boolean)
          .join(" · ");

  if (!activeId) return <NoSubscriptionState />;

  return (
    <>
      <PageHeader
        icon={<Globe className="h-5 w-5" />}
        title="Cosmos DB Accounts"
        description={description}
        actions={
          <ExportButtons
            filenameBase="cosmos_db"
            title="Cosmos DB Accounts Report"
            subtitle={activeName ?? undefined}
            rows={rows}
            columns={[
              { header: "Name", accessor: (r) => r.name },
              { header: "Resource Group", accessor: (r) => r.resourceGroup },
              { header: "API", accessor: (r) => r.api },
              { header: "Consistency", accessor: (r) => r.consistency },
              { header: "Regions", accessor: (r) => String(r.regions) },
              { header: "Multi-Region Write", accessor: (r) => (r.multiWrite ? "yes" : "no") },
              { header: "Auto-Failover", accessor: (r) => (r.autoFailover ? "on" : "off") },
              { header: "Public Access", accessor: (r) => (r.publicAccess ? "Enabled" : "Disabled") },
              { header: "Free Tier", accessor: (r) => (r.freeTier ? "yes" : "no") },
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
        searchPlaceholder="Filter by name, API, or consistency…"
        emptyMessage="No Cosmos DB accounts found in this subscription."
        getRowId={(r) => r.id}
      />
    </>
  );
}
