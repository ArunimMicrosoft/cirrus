"use client";

import * as React from "react";
import { Share2, AlertTriangle } from "lucide-react";
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
import { buildGraph } from "@/lib/ml/attackpath";
import type {
  VirtualMachine,
  NetworkInterface,
  NetworkSecurityGroup,
  PublicIpAddress,
  VirtualNetwork,
  SqlServer,
  KeyVault,
} from "@/lib/azure/types";

const KIND_LABELS: Record<string, string> = {
  vm: "VM",
  nic: "NIC",
  subnet: "Subnet",
  vnet: "VNet",
  publicIp: "Public IP",
  sensitive: "Sensitive",
  apiServer: "AKS API",
  frontDoor: "Front Door",
  firewall: "Firewall",
};

interface CritRow {
  id: string;
  name: string;
  kind: string;
  score: number; // 0..100 normalised
  dependents: number;
  spof: boolean;
}

export default function CriticalityPage() {
  const activeId = useSubscriptionStore((s) => s.activeId);
  const activeName = useSubscriptionStore((s) => s.activeName);

  const vms = useArmList<VirtualMachine>("/providers/Microsoft.Compute/virtualMachines", ArmApi.computeVms);
  const nics = useArmList<NetworkInterface>("/providers/Microsoft.Network/networkInterfaces", ArmApi.network);
  const nsgs = useArmList<NetworkSecurityGroup>("/providers/Microsoft.Network/networkSecurityGroups", ArmApi.network);
  const pips = useArmList<PublicIpAddress>("/providers/Microsoft.Network/publicIPAddresses", ArmApi.network);
  const vnets = useArmList<VirtualNetwork>("/providers/Microsoft.Network/virtualNetworks", ArmApi.network);
  const sql = useArmList<SqlServer>("/providers/Microsoft.Sql/servers", ArmApi.sql);
  const kvs = useArmList<KeyVault>("/providers/Microsoft.KeyVault/vaults", ArmApi.keyvault);

  const anyLoading = [vms, nics, nsgs, pips, vnets, sql, kvs].some((q) => q.isLoading);

  const model = React.useMemo(() => {
    const g = buildGraph({
      vms: vms.data?.value ?? [],
      nics: nics.data?.value ?? [],
      nsgs: nsgs.data?.value ?? [],
      pips: pips.data?.value ?? [],
      vnets: vnets.data?.value ?? [],
      sql: sql.data?.value ?? [],
      keyVaults: kvs.data?.value ?? [],
    });
    const pr = g.pageRank();
    const indeg = g.inDegree();
    const aps = new Set(g.articulationPoints());

    // Exclude the synthetic internet node; rank the rest.
    const entries = [...pr.entries()].filter(([id]) => id !== "__internet__");
    const maxScore = entries.reduce((m, [, s]) => Math.max(m, s), 0) || 1;

    const rows: CritRow[] = entries
      .map(([id, s]) => {
        const node = g.nodes.get(id);
        return {
          id,
          name: node?.label ?? id,
          kind: node?.kind ?? "?",
          score: Math.round((s / maxScore) * 100),
          dependents: indeg.get(id) ?? 0,
          spof: aps.has(id),
        };
      })
      .sort((a, b) => b.score - a.score);

    return { rows, nodeCount: g.nodes.size - 1, spofCount: aps.size };
  }, [vms.data, nics.data, nsgs.data, pips.data, vnets.data, sql.data, kvs.data]);

  const top = model.rows[0];

  const columns: DataColumn<CritRow>[] = [
    { key: "name", header: "Resource", accessor: (r) => r.name, cell: (r) => <span className="font-medium">{r.name}</span> },
    {
      key: "kind",
      header: "Type",
      accessor: (r) => KIND_LABELS[r.kind] ?? r.kind,
      cell: (r) => <Badge variant="outline">{KIND_LABELS[r.kind] ?? r.kind}</Badge>,
    },
    {
      key: "score",
      header: "Criticality",
      accessor: (r) => r.score,
      cell: (r) => (
        <div className="flex items-center gap-2">
          <div className="h-1.5 w-20 overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-primary" style={{ width: `${r.score}%` }} />
          </div>
          <span className="font-mono text-xs tabular-nums">{r.score}</span>
        </div>
      ),
    },
    { key: "dependents", header: "Dependents", accessor: (r) => r.dependents },
    {
      key: "spof",
      header: "Failure impact",
      accessor: (r) => (r.spof ? "single point of failure" : "redundant"),
      cell: (r) => (r.spof ? <Badge variant="destructive">Single point of failure</Badge> : <span className="text-xs text-muted-foreground">—</span>),
    },
  ];

  if (!activeId) return <NoSubscriptionState />;

  return (
    <>
      <PageHeader
        icon={<Share2 className="h-5 w-5" />}
        title="Resource Criticality"
        description={`Which resources the rest of ${activeName ?? "this subscription"} leans on most, ranked by dependency weight. Graph theory — read-only.`}
        actions={
          <ExportButtons
            filenameBase="resource_criticality"
            title="Resource Criticality Ranking"
            subtitle={activeName ?? undefined}
            rows={model.rows}
            columns={[
              { header: "Resource", accessor: (r) => r.name },
              { header: "Type", accessor: (r) => KIND_LABELS[r.kind] ?? r.kind },
              { header: "Criticality (0-100)", accessor: (r) => `${r.score}` },
              { header: "Dependents", accessor: (r) => `${r.dependents}` },
              { header: "Single Point of Failure", accessor: (r) => (r.spof ? "yes" : "no") },
            ]}
          />
        }
      />

      <AlgorithmBadge keys={["pageRank", "tarjan"]} />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Resources ranked" value={model.nodeCount} loading={anyLoading} />
        <StatCard label="Single points of failure" value={model.spofCount} delta="cut vertices" deltaTone={model.spofCount > 0 ? "negative" : "positive"} loading={anyLoading} />
        <StatCard label="Most critical" value={top?.name ?? "—"} delta={top ? `${top.score}/100` : undefined} loading={anyLoading} className="md:col-span-2" />
      </div>

      <Alert>
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>Why this matters</AlertTitle>
        <AlertDescription>
          Criticality (PageRank) measures how much of the estate ultimately
          depends on each resource — the top of this list is where an outage
          ripples furthest, so it earns the strongest redundancy and change
          control. Rows also flagged as a single point of failure (Tarjan cut
          vertices) are the most urgent: their loss splits the environment.
        </AlertDescription>
      </Alert>

      <DataTable
        rows={model.rows}
        columns={columns}
        isLoading={anyLoading}
        searchPlaceholder="Filter by resource or type…"
        emptyMessage="No resources to rank in this subscription."
        getRowId={(r) => r.id}
        pageSize={20}
      />
    </>
  );
}
