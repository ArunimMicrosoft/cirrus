"use client";

import { KeyRound, Lock, Unlock, ShieldCheck } from "lucide-react";
import { PageHeader } from "@/components/data/PageHeader";
import { DataTable, type DataColumn } from "@/components/data/DataTable";
import { NoSubscriptionState } from "@/components/data/NoSubscriptionState";
import { ExportButtons } from "@/components/data/ExportButtons";
import { StatCard } from "@/components/data/StatCard";
import { useArmList } from "@/lib/hooks/use-arm";
import { useSubscriptionStore } from "@/lib/hooks/use-subscription";
import { ArmApi } from "@/lib/azure/arm";
import type { KeyVault } from "@/lib/azure/types";
import { resourceGroupFromId } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

interface VaultRow {
  id: string;
  name: string;
  resourceGroup: string;
  region: string;
  sku: string;
  softDelete: boolean;
  purgeProtection: boolean;
  rbac: boolean;
  networkDeny: boolean;
  retention: number;
  score: number;
  issues: string[];
}

function analyze(vault: KeyVault): VaultRow {
  const p = vault.properties ?? {};
  const softDelete = p.enableSoftDelete ?? false;
  const purge = p.enablePurgeProtection ?? false;
  const rbac = p.enableRbacAuthorization ?? false;
  const networkDeny = (p.networkAcls?.defaultAction ?? "Allow").toLowerCase() === "deny";

  const issues: string[] = [];
  if (!softDelete) issues.push("Soft-delete disabled");
  if (!purge) issues.push("Purge protection disabled");
  if (!networkDeny) issues.push("Network open to all");
  if (!rbac && (p.accessPolicies?.length ?? 0) === 0) issues.push("No RBAC or access policies");

  const total = 4;
  const passed = total - issues.length;
  const score = Math.round((passed / total) * 100);

  return {
    id: vault.id,
    name: vault.name,
    resourceGroup: resourceGroupFromId(vault.id),
    region: vault.location,
    sku: p.sku?.name ?? "-",
    softDelete,
    purgeProtection: purge,
    rbac,
    networkDeny,
    retention: p.softDeleteRetentionInDays ?? 90,
    score,
    issues,
  };
}

const CheckBadge = ({ ok, label }: { ok: boolean; label: string }) =>
  ok ? (
    <Badge variant="success">
      <Lock className="mr-1 h-3 w-3" />
      {label}
    </Badge>
  ) : (
    <Badge variant="destructive">
      <Unlock className="mr-1 h-3 w-3" />
      {label}
    </Badge>
  );

const columns: DataColumn<VaultRow>[] = [
  {
    key: "name",
    header: "Vault",
    accessor: (r) => r.name,
    cell: (r) => <span className="font-medium">{r.name}</span>,
  },
  { key: "rg", header: "Resource Group", accessor: (r) => r.resourceGroup },
  { key: "region", header: "Region", accessor: (r) => r.region },
  { key: "sku", header: "SKU", accessor: (r) => r.sku },
  {
    key: "softDelete",
    header: "Soft-Delete",
    accessor: (r) => (r.softDelete ? "yes" : "no"),
    cell: (r) => <CheckBadge ok={r.softDelete} label={r.softDelete ? "On" : "Off"} />,
  },
  {
    key: "purge",
    header: "Purge Prot.",
    accessor: (r) => (r.purgeProtection ? "yes" : "no"),
    cell: (r) => (
      <CheckBadge ok={r.purgeProtection} label={r.purgeProtection ? "On" : "Off"} />
    ),
  },
  {
    key: "rbac",
    header: "Auth",
    accessor: (r) => (r.rbac ? "RBAC" : "Access Policy"),
    cell: (r) =>
      r.rbac ? (
        <Badge variant="success">RBAC</Badge>
      ) : (
        <Badge variant="secondary">Access Policy</Badge>
      ),
  },
  {
    key: "net",
    header: "Network",
    accessor: (r) => (r.networkDeny ? "Deny" : "Allow"),
    cell: (r) =>
      r.networkDeny ? (
        <Badge variant="success">Deny by default</Badge>
      ) : (
        <Badge variant="warning">Allow all</Badge>
      ),
  },
  {
    key: "score",
    header: "Score",
    accessor: (r) => r.score,
    cell: (r) => {
      const tone = r.score >= 75 ? "success" : r.score >= 50 ? "warning" : "destructive";
      return <Badge variant={tone}>{r.score}%</Badge>;
    },
  },
];

export default function KeyVaultAuditPage() {
  const activeId = useSubscriptionStore((s) => s.activeId);
  const activeName = useSubscriptionStore((s) => s.activeName);
  const { data, isLoading, isError, error } = useArmList<KeyVault>(
    "/providers/Microsoft.KeyVault/vaults",
    ArmApi.keyvault,
  );

  const rows = (data?.value ?? []).map(analyze);
  const secure = rows.filter((r) => r.issues.length === 0).length;
  const totalIssues = rows.reduce((s, r) => s + r.issues.length, 0);
  const avgScore =
    rows.length > 0 ? Math.round(rows.reduce((s, r) => s + r.score, 0) / rows.length) : 0;

  if (!activeId) return <NoSubscriptionState />;

  return (
    <>
      <PageHeader
        icon={<KeyRound className="h-5 w-5" />}
        title="Key Vault Security Audit"
        description={`Configuration audit for all Key Vaults in ${activeName ?? "this subscription"}. Uses management-plane data only.`}
        actions={
          <ExportButtons
            filenameBase="key_vault_audit"
            title="Key Vault Security Audit"
            subtitle={activeName ?? undefined}
            rows={rows}
            columns={[
              { header: "Name", accessor: (r) => r.name },
              { header: "Resource Group", accessor: (r) => r.resourceGroup },
              { header: "Region", accessor: (r) => r.region },
              { header: "SKU", accessor: (r) => r.sku },
              { header: "Soft Delete", accessor: (r) => (r.softDelete ? "yes" : "no") },
              { header: "Purge Protection", accessor: (r) => (r.purgeProtection ? "yes" : "no") },
              { header: "RBAC Auth", accessor: (r) => (r.rbac ? "yes" : "no") },
              { header: "Network Deny", accessor: (r) => (r.networkDeny ? "yes" : "no") },
              { header: "Retention Days", accessor: (r) => r.retention },
              { header: "Score", accessor: (r) => `${r.score}%` },
              { header: "Issues", accessor: (r) => r.issues.join("; ") },
            ]}
          />
        }
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard
          label="Key Vaults"
          value={rows.length}
          icon={<KeyRound className="h-4 w-4" />}
          loading={isLoading}
        />
        <StatCard
          label="Fully secure"
          value={secure}
          delta={`${rows.length - secure} need attention`}
          deltaTone={rows.length - secure > 0 ? "negative" : "positive"}
          loading={isLoading}
        />
        <StatCard
          label="Avg. score"
          value={`${avgScore}%`}
          icon={<ShieldCheck className="h-4 w-4" />}
          loading={isLoading}
        />
        <StatCard label="Total issues" value={totalIssues} loading={isLoading} />
      </div>

      <Alert>
        <AlertTitle>Data plane note</AlertTitle>
        <AlertDescription>
          Certificate / secret expiry lists require Key Vault{" "}
          <em>data plane</em> permissions on each vault. This app uses
          management plane only (Reader role), so we surface configuration
          hygiene here — certificate rotation lives in the Portal for now.
        </AlertDescription>
      </Alert>

      <DataTable
        rows={rows}
        columns={columns}
        isLoading={isLoading}
        isError={isError}
        error={error}
        searchPlaceholder="Filter by vault name or region…"
        emptyMessage="No Key Vaults found in this subscription."
        getRowId={(r) => r.id}
      />
    </>
  );
}
