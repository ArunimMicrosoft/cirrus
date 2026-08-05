"use client";

import { useQueries } from "@tanstack/react-query";
import { Recycle, ShieldCheck, ShieldAlert } from "lucide-react";
import { PageHeader } from "@/components/data/PageHeader";
import { DataTable, type DataColumn } from "@/components/data/DataTable";
import { NoSubscriptionState } from "@/components/data/NoSubscriptionState";
import { ExportButtons } from "@/components/data/ExportButtons";
import { StatCard } from "@/components/data/StatCard";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useArmList } from "@/lib/hooks/use-arm";
import { useSubscriptionStore } from "@/lib/hooks/use-subscription";
import { ArmApi } from "@/lib/azure/arm";
import { api } from "@/lib/api-client";
import { resourceGroupFromId, resourceNameFromId } from "@/lib/utils";
import type { RecoveryVault } from "@/lib/azure/types";

interface ProtectedItem {
  id: string;
  name: string;
  properties?: {
    friendlyName?: string;
    protectionStatus?: string;
    protectionState?: string;
    healthStatus?: string;
    lastBackupTime?: string;
    lastRecoveryPoint?: string;
    policyId?: string;
    workloadType?: string;
    sourceResourceId?: string;
    backupManagementType?: string;
  };
}

interface BackupRow {
  id: string;
  vmName: string;
  vault: string;
  resourceGroup: string;
  location: string;
  protectionStatus: string;
  protectionState: string;
  health: string;
  lastBackup: string;
  lastRecoveryPoint: string;
  policy: string;
}

function formatTs(ts: string | undefined): string {
  if (!ts) return "-";
  try {
    return new Date(ts).toLocaleString();
  } catch {
    return ts;
  }
}

export default function VmBackupsPage() {
  const activeId = useSubscriptionStore((s) => s.activeId);
  const activeName = useSubscriptionStore((s) => s.activeName);

  const vaults = useArmList<RecoveryVault>(
    "/providers/Microsoft.RecoveryServices/vaults",
    ArmApi.recoveryservices,
  );

  const vaultList = vaults.data?.value ?? [];

  // For each vault, fetch protected items (Azure IaaS VMs only).
  const itemQueries = useQueries({
    queries: vaultList.map((v) => ({
      queryKey: ["backup-protected-items", v.id],
      queryFn: async () => {
        const rg = resourceGroupFromId(v.id);
        const path = `/resourceGroups/${encodeURIComponent(rg)}/providers/Microsoft.RecoveryServices/vaults/${encodeURIComponent(v.name)}/backupProtectedItems`;
        try {
          const res = await api.armList<ProtectedItem>(
            activeId ?? "",
            path,
            ArmApi.recoveryservicesBackup,
          );
          return { vault: v, items: res.value };
        } catch {
          return { vault: v, items: [] as ProtectedItem[] };
        }
      },
      enabled: Boolean(activeId) && vaultList.length > 0,
      staleTime: 60_000,
    })),
  });

  const rows: BackupRow[] = [];
  itemQueries.forEach((q) => {
    if (!q.data) return;
    const { vault, items } = q.data;
    items
      .filter(
        (i) =>
          (i.properties?.backupManagementType ?? "").toLowerCase() === "azureiaasvm",
      )
      .forEach((i) => {
        const p = i.properties ?? {};
        rows.push({
          id: i.id,
          vmName:
            p.friendlyName ||
            (p.sourceResourceId ? resourceNameFromId(p.sourceResourceId) : i.name),
          vault: vault.name,
          resourceGroup: resourceGroupFromId(vault.id),
          location: vault.location,
          protectionStatus: p.protectionStatus ?? "-",
          protectionState: p.protectionState ?? "-",
          // Azure Backup returns healthStatus=null when the item is healthy.
          health: p.healthStatus && p.healthStatus !== "None" ? p.healthStatus : "Healthy",
          lastBackup: formatTs(p.lastBackupTime),
          lastRecoveryPoint: formatTs(p.lastRecoveryPoint),
          policy: p.policyId ? resourceNameFromId(p.policyId) : "-",
        });
      });
  });

  const totalProtected = rows.length;
  const healthy = rows.filter((r) => r.health.toLowerCase() === "healthy").length;
  const neverBackedUp = rows.filter((r) => r.lastBackup === "-").length;
  const anyLoading = vaults.isLoading || itemQueries.some((q) => q.isLoading);

  const columns: DataColumn<BackupRow>[] = [
    {
      key: "vm",
      header: "VM",
      accessor: (r) => r.vmName,
      cell: (r) => <span className="font-medium">{r.vmName}</span>,
    },
    { key: "vault", header: "Vault", accessor: (r) => r.vault },
    { key: "rg", header: "Resource Group", accessor: (r) => r.resourceGroup },
    { key: "region", header: "Region", accessor: (r) => r.location },
    {
      key: "health",
      header: "Health",
      accessor: (r) => r.health,
      cell: (r) => {
        const h = r.health.toLowerCase();
        if (h === "healthy" || h === "passed")
          return (
            <Badge variant="success">
              <ShieldCheck className="mr-1 h-3 w-3" />
              Healthy
            </Badge>
          );
        if (h.includes("critical") || h.includes("failed"))
          return (
            <Badge variant="destructive">
              <ShieldAlert className="mr-1 h-3 w-3" />
              {r.health}
            </Badge>
          );
        return <Badge variant="warning">{r.health}</Badge>;
      },
    },
    {
      key: "state",
      header: "State",
      accessor: (r) => r.protectionState,
      cell: (r) =>
        r.protectionState.toLowerCase() === "protected" ? (
          <Badge variant="success">Protected</Badge>
        ) : (
          <Badge variant="outline">{r.protectionState}</Badge>
        ),
    },
    {
      key: "lastBackup",
      header: "Last backup",
      accessor: (r) => r.lastBackup,
      cell: (r) => (
        <span className="text-xs tabular-nums">
          {r.lastBackup}
          {r.lastBackup === "-" && (
            <Badge variant="destructive" className="ml-2">
              Never
            </Badge>
          )}
        </span>
      ),
    },
    { key: "policy", header: "Policy", accessor: (r) => r.policy },
  ];

  if (!activeId) return <NoSubscriptionState />;

  return (
    <>
      <PageHeader
        icon={<Recycle className="h-5 w-5" />}
        title="VM Backups"
        description={`Recovery Services Vaults and protected VMs in ${activeName ?? "this subscription"}.`}
        actions={
          <ExportButtons
            filenameBase="vm_backups"
            title="VM Backups Report"
            subtitle={activeName ?? undefined}
            rows={rows}
            columns={[
              { header: "VM", accessor: (r) => r.vmName },
              { header: "Vault", accessor: (r) => r.vault },
              { header: "Resource Group", accessor: (r) => r.resourceGroup },
              { header: "Region", accessor: (r) => r.location },
              { header: "Health", accessor: (r) => r.health },
              { header: "Protection State", accessor: (r) => r.protectionState },
              { header: "Protection Status", accessor: (r) => r.protectionStatus },
              { header: "Last Backup", accessor: (r) => r.lastBackup },
              { header: "Last Recovery Point", accessor: (r) => r.lastRecoveryPoint },
              { header: "Policy", accessor: (r) => r.policy },
            ]}
          />
        }
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Vaults" value={vaultList.length} loading={vaults.isLoading} />
        <StatCard
          label="Protected VMs"
          value={totalProtected}
          icon={<Recycle className="h-4 w-4" />}
          loading={anyLoading}
        />
        <StatCard
          label="Healthy backups"
          value={healthy}
          delta={`${totalProtected - healthy} need attention`}
          deltaTone={totalProtected - healthy > 0 ? "negative" : "positive"}
          loading={anyLoading}
        />
        <StatCard
          label="Never backed up"
          value={neverBackedUp}
          deltaTone={neverBackedUp > 0 ? "negative" : "positive"}
          loading={anyLoading}
        />
      </div>

      {vaultList.length === 0 && !vaults.isLoading && (
        <Alert>
          <AlertTitle>No Recovery Services Vaults found</AlertTitle>
          <AlertDescription>
            This subscription has no vaults. Backup coverage is 0% for its VMs.
          </AlertDescription>
        </Alert>
      )}

      <DataTable
        rows={rows}
        columns={columns}
        isLoading={anyLoading}
        searchPlaceholder="Filter by VM, vault, or health…"
        emptyMessage="No protected VMs found across the vaults in this subscription."
        getRowId={(r) => r.id}
      />
    </>
  );
}
