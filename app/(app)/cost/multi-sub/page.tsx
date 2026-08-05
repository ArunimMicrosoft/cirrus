"use client";

import { useQueries } from "@tanstack/react-query";
import { BarChart3, Globe2, Home } from "lucide-react";
import Link from "next/link";
import { PageHeader } from "@/components/data/PageHeader";
import { DataTable, type DataColumn } from "@/components/data/DataTable";
import { ExportButtons } from "@/components/data/ExportButtons";
import { StatCard } from "@/components/data/StatCard";
import { useSubscriptions } from "@/lib/hooks/use-subscription";
import { api } from "@/lib/api-client";
import { ArmApi } from "@/lib/azure/arm";
import { formatCurrency, formatNumber } from "@/lib/utils";
import type {
  Disk,
  ResourceGroup,
  VirtualMachine,
  StorageAccount,
  AppService,
  SqlServer,
  PublicIpAddress,
} from "@/lib/azure/types";
import { HOURS_PER_MONTH } from "@/lib/hooks/use-vm-prices";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";

interface SubSummary {
  subscriptionId: string;
  displayName: string;
  isHome: boolean;
  vms: number;
  disks: number;
  orphanDisks: number;
  storage: number;
  apps: number;
  sql: number;
  publicIps: number;
  unattachedIps: number;
  resourceGroups: number;
  untaggedRgs: number;
  estMonthlyVmCost: number;
  loading: boolean;
  error: string | null;
}

/**
 * Fan-out scan across every subscription. Each sub makes 7 parallel ARM list
 * calls. TanStack Query batches, dedupes, and surfaces progress as each
 * subscription completes.
 */
function useAllSubSummaries() {
  const { data: subs = [], isLoading: subsLoading } = useSubscriptions();

  const queries = useQueries({
    queries: subs.map((sub) => ({
      queryKey: ["multi-sub", sub.subscriptionId],
      queryFn: async (): Promise<SubSummary> => {
        try {
          const [rgs, vms, disks, storage, apps, sql, pips] = await Promise.all([
            api.armList<ResourceGroup>(sub.subscriptionId, "/resourcegroups", ArmApi.resourceGroups),
            api.armList<VirtualMachine>(
              sub.subscriptionId,
              "/providers/Microsoft.Compute/virtualMachines",
              ArmApi.computeVms,
            ),
            api.armList<Disk>(
              sub.subscriptionId,
              "/providers/Microsoft.Compute/disks",
              ArmApi.computeDisks,
            ),
            api.armList<StorageAccount>(
              sub.subscriptionId,
              "/providers/Microsoft.Storage/storageAccounts",
              ArmApi.storage,
            ),
            api.armList<AppService>(
              sub.subscriptionId,
              "/providers/Microsoft.Web/sites",
              ArmApi.web,
            ),
            api.armList<SqlServer>(
              sub.subscriptionId,
              "/providers/Microsoft.Sql/servers",
              ArmApi.sql,
            ),
            api.armList<PublicIpAddress>(
              sub.subscriptionId,
              "/providers/Microsoft.Network/publicIPAddresses",
              ArmApi.network,
            ),
          ]);

          // Rough VM cost: fetch prices for each unique (size, region) pair.
          // We don't want to blow out our request budget; use a simple in-memory
          // dedup and call /api/prices/vm per unique key.
          const uniqueVms = new Map<string, { size: string; region: string; count: number }>();
          vms.value.forEach((v) => {
            const size = v.properties?.hardwareProfile?.vmSize ?? "";
            if (!size) return;
            const key = `${size}|${v.location}`;
            const cur = uniqueVms.get(key);
            uniqueVms.set(
              key,
              cur ? { ...cur, count: cur.count + 1 } : { size, region: v.location, count: 1 },
            );
          });
          const priceResults = await Promise.all(
            [...uniqueVms.values()].map((p) =>
              api.vmPrice(p.size, p.region).then(
                (r) => ({ ...p, rate: r.payg.rate }),
                () => ({ ...p, rate: 0.05 * 2 }), // fallback per-core
              ),
            ),
          );
          const estMonthlyVmCost = priceResults.reduce(
            (sum, r) => sum + r.rate * r.count * HOURS_PER_MONTH,
            0,
          );

          return {
            subscriptionId: sub.subscriptionId,
            displayName: sub.displayName,
            isHome: sub.isHome,
            vms: vms.value.length,
            disks: disks.value.length,
            orphanDisks: disks.value.filter((d) => !d.managedBy).length,
            storage: storage.value.length,
            apps: apps.value.length,
            sql: sql.value.length,
            publicIps: pips.value.length,
            unattachedIps: pips.value.filter((p) => !p.properties?.ipConfiguration).length,
            resourceGroups: rgs.value.length,
            untaggedRgs: rgs.value.filter((r) => !r.tags || Object.keys(r.tags).length === 0).length,
            estMonthlyVmCost,
            loading: false,
            error: null,
          };
        } catch (e) {
          return {
            subscriptionId: sub.subscriptionId,
            displayName: sub.displayName,
            isHome: sub.isHome,
            vms: 0,
            disks: 0,
            orphanDisks: 0,
            storage: 0,
            apps: 0,
            sql: 0,
            publicIps: 0,
            unattachedIps: 0,
            resourceGroups: 0,
            untaggedRgs: 0,
            estMonthlyVmCost: 0,
            loading: false,
            error: e instanceof Error ? e.message : String(e),
          };
        }
      },
      // Cache each summary for 5 min so cross-nav is instant.
      staleTime: 5 * 60_000,
    })),
  });

  const rows: SubSummary[] = subs.map((sub, i) => {
    const q = queries[i];
    if (q?.data) return q.data;
    return {
      subscriptionId: sub.subscriptionId,
      displayName: sub.displayName,
      isHome: sub.isHome,
      vms: 0,
      disks: 0,
      orphanDisks: 0,
      storage: 0,
      apps: 0,
      sql: 0,
      publicIps: 0,
      unattachedIps: 0,
      resourceGroups: 0,
      untaggedRgs: 0,
      estMonthlyVmCost: 0,
      loading: q?.isLoading ?? true,
      error: null,
    };
  });

  const completed = queries.filter((q) => q.isSuccess).length;
  return { rows, subsLoading, completed, total: subs.length };
}

export default function MultiSubPage() {
  const { rows, subsLoading, completed, total } = useAllSubSummaries();

  const totals = rows.reduce(
    (acc, r) => ({
      vms: acc.vms + r.vms,
      cost: acc.cost + r.estMonthlyVmCost,
      orphans: acc.orphans + r.orphanDisks + r.unattachedIps,
      untagged: acc.untagged + r.untaggedRgs,
    }),
    { vms: 0, cost: 0, orphans: 0, untagged: 0 },
  );

  const columns: DataColumn<SubSummary>[] = [
    {
      key: "name",
      header: "Subscription",
      accessor: (r) => r.displayName,
      cell: (r) => (
        <div className="flex items-center gap-1.5">
          {r.isHome ? (
            <Home className="h-3.5 w-3.5 text-primary" />
          ) : (
            <Globe2 className="h-3.5 w-3.5 text-warning" />
          )}
          <span className="font-medium">{r.displayName}</span>
          {r.loading && (
            <span className="text-[10px] text-muted-foreground">scanning…</span>
          )}
          {r.error && <Badge variant="destructive">error</Badge>}
        </div>
      ),
    },
    {
      key: "vms",
      header: "VMs",
      accessor: (r) => r.vms,
      cell: (r) => <span className="tabular-nums">{formatNumber(r.vms)}</span>,
    },
    {
      key: "cost",
      header: "VM cost/mo",
      accessor: (r) => r.estMonthlyVmCost,
      cell: (r) => (
        <span className="tabular-nums font-medium">
          {r.loading ? "…" : formatCurrency(r.estMonthlyVmCost)}
        </span>
      ),
    },
    {
      key: "disks",
      header: "Disks (orphan)",
      accessor: (r) => `${r.disks} (${r.orphanDisks})`,
      cell: (r) => (
        <span className="tabular-nums">
          {formatNumber(r.disks)}{" "}
          {r.orphanDisks > 0 && (
            <span className="text-destructive">({r.orphanDisks})</span>
          )}
        </span>
      ),
    },
    {
      key: "storage",
      header: "Storage",
      accessor: (r) => r.storage,
      cell: (r) => <span className="tabular-nums">{formatNumber(r.storage)}</span>,
    },
    {
      key: "apps",
      header: "Apps",
      accessor: (r) => r.apps,
      cell: (r) => <span className="tabular-nums">{formatNumber(r.apps)}</span>,
    },
    {
      key: "sql",
      header: "SQL",
      accessor: (r) => r.sql,
      cell: (r) => <span className="tabular-nums">{formatNumber(r.sql)}</span>,
    },
    {
      key: "rgs",
      header: "RGs (untagged)",
      accessor: (r) => `${r.resourceGroups} (${r.untaggedRgs})`,
      cell: (r) => (
        <span className="tabular-nums">
          {formatNumber(r.resourceGroups)}{" "}
          {r.untaggedRgs > 0 && (
            <span className="text-warning">({r.untaggedRgs})</span>
          )}
        </span>
      ),
    },
    {
      key: "action",
      header: "",
      accessor: () => "",
      cell: (r) => (
        <Link
          href="/dashboard"
          className="text-xs text-primary hover:underline"
          title={`Switch to ${r.displayName} in the picker`}
        >
          Open →
        </Link>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        icon={<BarChart3 className="h-5 w-5" />}
        title="Multi-Subscription Summary"
        description={`Executive overview across all ${total} accessible subscription${total === 1 ? "" : "s"}. Fans out per-subscription ARM calls in parallel.`}
        actions={
          <ExportButtons
            filenameBase="multi_sub_summary"
            title="Multi-Subscription Summary"
            rows={rows}
            columns={[
              { header: "Subscription", accessor: (r) => r.displayName },
              { header: "Home Tenant", accessor: (r) => (r.isHome ? "yes" : "no") },
              { header: "Subscription ID", accessor: (r) => r.subscriptionId },
              { header: "VMs", accessor: (r) => r.vms },
              { header: "Disks", accessor: (r) => r.disks },
              { header: "Orphan Disks", accessor: (r) => r.orphanDisks },
              { header: "Storage Accts", accessor: (r) => r.storage },
              { header: "App Services", accessor: (r) => r.apps },
              { header: "SQL Servers", accessor: (r) => r.sql },
              { header: "Public IPs", accessor: (r) => r.publicIps },
              { header: "Unattached IPs", accessor: (r) => r.unattachedIps },
              { header: "Resource Groups", accessor: (r) => r.resourceGroups },
              { header: "Untagged RGs", accessor: (r) => r.untaggedRgs },
              { header: "Est. VM Cost/mo", accessor: (r) => r.estMonthlyVmCost.toFixed(2) },
            ]}
          />
        }
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard
          label="Subscriptions"
          value={total}
          delta={`${completed}/${total} scanned`}
          loading={subsLoading}
        />
        <StatCard
          label="Total VMs"
          value={formatNumber(totals.vms)}
          loading={subsLoading || completed < total}
        />
        <StatCard
          label="Est. VM cost/mo"
          value={formatCurrency(totals.cost)}
          delta={`${formatCurrency(totals.cost * 12)} / year`}
          loading={subsLoading || completed < total}
        />
        <StatCard
          label="Orphan / Untagged"
          value={`${totals.orphans} · ${totals.untagged}`}
          delta="orphans · untagged RGs"
          deltaTone={totals.orphans + totals.untagged > 0 ? "negative" : "positive"}
          loading={subsLoading || completed < total}
        />
      </div>

      {completed < total && (
        <Alert>
          <AlertTitle>
            Scanning {completed}/{total} subscriptions…
          </AlertTitle>
          <AlertDescription>
            Each row streams in as its ARM scans complete. You can already
            filter and export what's loaded.
          </AlertDescription>
        </Alert>
      )}

      <DataTable
        rows={rows}
        columns={columns}
        isLoading={subsLoading && rows.length === 0}
        searchPlaceholder="Filter by subscription name…"
        emptyMessage="No subscriptions accessible."
        getRowId={(r) => r.subscriptionId}
      />
    </>
  );
}
