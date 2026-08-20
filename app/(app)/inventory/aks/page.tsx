"use client";

import { Container } from "lucide-react";
import { PageHeader } from "@/components/data/PageHeader";
import { DataTable, type DataColumn } from "@/components/data/DataTable";
import { NoSubscriptionState } from "@/components/data/NoSubscriptionState";
import { ExportButtons } from "@/components/data/ExportButtons";
import { useArmList } from "@/lib/hooks/use-arm";
import { useSubscriptionStore } from "@/lib/hooks/use-subscription";
import { ArmApi } from "@/lib/azure/arm";
import type { ManagedCluster } from "@/lib/azure/types";
import { resourceGroupFromId } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

interface AksRow {
  id: string;
  name: string;
  resourceGroup: string;
  region: string;
  version: string;
  nodePools: number;
  nodes: number;
  networkPlugin: string;
  tier: string;
  privateCluster: boolean;
  aadManaged: boolean;
  localAccounts: boolean;
  freeTier: boolean;
}

function toRow(c: ManagedCluster): AksRow {
  const p = c.properties ?? {};
  const pools = p.agentPoolProfiles ?? [];
  const nodes = pools.reduce((s, pool) => s + (pool.count ?? 0), 0);
  const tier = c.sku?.tier ?? "Free";
  return {
    id: c.id,
    name: c.name,
    resourceGroup: resourceGroupFromId(c.id),
    region: c.location,
    version: p.currentKubernetesVersion || p.kubernetesVersion || "—",
    nodePools: pools.length,
    nodes,
    networkPlugin: p.networkProfile?.networkPlugin ?? "—",
    tier,
    privateCluster: Boolean(p.apiServerAccessProfile?.enablePrivateCluster),
    aadManaged: Boolean(p.aadProfile?.managed),
    localAccounts: !p.disableLocalAccounts,
    freeTier: /free/i.test(tier),
  };
}

/** Compare "1.27.9" style versions; returns true if a < b. */
function versionLt(a: string, b: string): boolean {
  const pa = a.split(".").map((n) => parseInt(n, 10) || 0);
  const pb = b.split(".").map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < 3; i++) {
    if ((pa[i] ?? 0) !== (pb[i] ?? 0)) return (pa[i] ?? 0) < (pb[i] ?? 0);
  }
  return false;
}
// Rough "old" threshold; anything below this is flagged for an upgrade review.
const OLD_K8S = "1.28.0";

const columns: DataColumn<AksRow>[] = [
  { key: "name", header: "Name", accessor: (r) => r.name, cell: (r) => <span className="font-medium">{r.name}</span> },
  { key: "rg", header: "Resource Group", accessor: (r) => r.resourceGroup },
  { key: "region", header: "Region", accessor: (r) => r.region },
  {
    key: "version",
    header: "K8s version",
    accessor: (r) => r.version,
    cell: (r) =>
      r.version !== "—" && versionLt(r.version, OLD_K8S) ? (
        <Badge variant="warning">{r.version} · upgrade</Badge>
      ) : (
        <span className="font-mono text-xs">{r.version}</span>
      ),
  },
  { key: "pools", header: "Node pools", accessor: (r) => r.nodePools },
  { key: "nodes", header: "Nodes", accessor: (r) => r.nodes },
  { key: "plugin", header: "Network", accessor: (r) => r.networkPlugin },
  {
    key: "tier",
    header: "SKU",
    accessor: (r) => r.tier,
    cell: (r) => (r.freeTier ? <Badge variant="warning">Free · no SLA</Badge> : <Badge variant="secondary">{r.tier}</Badge>),
  },
  {
    key: "api",
    header: "API server",
    accessor: (r) => (r.privateCluster ? "Private" : "Public"),
    cell: (r) => (r.privateCluster ? <Badge variant="success">Private</Badge> : <Badge variant="warning">Public</Badge>),
  },
  {
    key: "auth",
    header: "Auth",
    accessor: (r) => (r.aadManaged ? "Azure AD" : "local"),
    cell: (r) =>
      r.aadManaged && !r.localAccounts ? (
        <Badge variant="success">Azure AD only</Badge>
      ) : r.aadManaged ? (
        <span className="text-xs">Azure AD + local</span>
      ) : (
        <Badge variant="warning">Local accounts</Badge>
      ),
  },
];

export default function AksPage() {
  const activeId = useSubscriptionStore((s) => s.activeId);
  const activeName = useSubscriptionStore((s) => s.activeName);
  const { data, isLoading, isError, error } = useArmList<ManagedCluster>(
    "/providers/Microsoft.ContainerService/managedClusters",
    ArmApi.containerService,
  );

  const rows = (data?.value ?? []).map(toRow);
  const publicApi = rows.filter((r) => !r.privateCluster).length;
  const localAuth = rows.filter((r) => !r.aadManaged || r.localAccounts).length;
  const oldVersion = rows.filter((r) => r.version !== "—" && versionLt(r.version, OLD_K8S)).length;
  const totalNodes = rows.reduce((s, r) => s + r.nodes, 0);

  const description =
    rows.length === 0
      ? `No AKS clusters found in ${activeName ?? "the selected subscription"}.`
      : [
          `${rows.length} cluster${rows.length === 1 ? "" : "s"} · ${totalNodes} nodes`,
          publicApi > 0 ? `${publicApi} with public API server` : "all private",
          localAuth > 0 ? `${localAuth} allowing local accounts` : null,
          oldVersion > 0 ? `${oldVersion} on an old K8s version` : null,
        ]
          .filter(Boolean)
          .join(" · ");

  if (!activeId) return <NoSubscriptionState />;

  return (
    <>
      <PageHeader
        icon={<Container className="h-5 w-5" />}
        title="AKS Clusters"
        description={description}
        actions={
          <ExportButtons
            filenameBase="aks_clusters"
            title="AKS Clusters Report"
            subtitle={activeName ?? undefined}
            rows={rows}
            columns={[
              { header: "Name", accessor: (r) => r.name },
              { header: "Resource Group", accessor: (r) => r.resourceGroup },
              { header: "Region", accessor: (r) => r.region },
              { header: "K8s Version", accessor: (r) => r.version },
              { header: "Node Pools", accessor: (r) => String(r.nodePools) },
              { header: "Nodes", accessor: (r) => String(r.nodes) },
              { header: "Network Plugin", accessor: (r) => r.networkPlugin },
              { header: "SKU Tier", accessor: (r) => r.tier },
              { header: "Private Cluster", accessor: (r) => (r.privateCluster ? "yes" : "no") },
              { header: "Azure AD Managed", accessor: (r) => (r.aadManaged ? "yes" : "no") },
              { header: "Local Accounts", accessor: (r) => (r.localAccounts ? "enabled" : "disabled") },
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
        searchPlaceholder="Filter by name, version, or network plugin…"
        emptyMessage="No AKS clusters found in this subscription."
        getRowId={(r) => r.id}
      />
    </>
  );
}
