"use client";

import { useMemo, useState } from "react";
import { KeyRound, Key, FileLock2, ScrollText, ShieldAlert, CalendarClock } from "lucide-react";
import { PageHeader } from "@/components/data/PageHeader";
import { StatCard } from "@/components/data/StatCard";
import { DataTable, type DataColumn } from "@/components/data/DataTable";
import { NoSubscriptionState } from "@/components/data/NoSubscriptionState";
import { ExportButtons } from "@/components/data/ExportButtons";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useArmList } from "@/lib/hooks/use-arm";
import { useVaultObjects, type VaultRef } from "@/lib/hooks/use-keyvault";
import { useSubscriptionStore } from "@/lib/hooks/use-subscription";
import { ArmApi } from "@/lib/azure/arm";
import type { KeyVault, KeyVaultObjectKind } from "@/lib/azure/types";
import { resourceGroupFromId } from "@/lib/utils";

/* ---------------------------------------------------------------- helpers */

const KIND_LABEL: Record<KeyVaultObjectKind, string> = {
  keys: "Key",
  secrets: "Secret",
  certificates: "Certificate",
};

function objectNameFromId(id?: string): string {
  if (!id) return "—";
  // .../secrets/<name>/<version>  or  .../keys/<name>
  const parts = id.split("/").filter(Boolean);
  const kindIdx = parts.findIndex((p) =>
    p === "keys" || p === "secrets" || p === "certificates",
  );
  if (kindIdx >= 0 && parts[kindIdx + 1]) return parts[kindIdx + 1];
  return parts[parts.length - 1] ?? "—";
}

/** Days from now until an epoch-seconds timestamp. +Infinity when absent. */
function daysUntilEpoch(sec?: number): number {
  if (!sec || !Number.isFinite(sec)) return Number.POSITIVE_INFINITY;
  return Math.floor((sec * 1000 - Date.now()) / 86_400_000);
}

/** Days since an epoch-seconds timestamp. null when absent. */
function daysSinceEpoch(sec?: number): number | null {
  if (!sec || !Number.isFinite(sec)) return null;
  return Math.floor((Date.now() - sec * 1000) / 86_400_000);
}

function fmtEpoch(sec?: number): string {
  if (!sec || !Number.isFinite(sec)) return "—";
  return new Date(sec * 1000).toLocaleDateString();
}

function expiryBadge(days: number, hasExpiry: boolean) {
  if (!hasExpiry) return <Badge variant="secondary">no expiry</Badge>;
  if (days < 0) return <Badge variant="destructive">expired</Badge>;
  if (days <= 30) return <Badge variant="destructive">{days}d left</Badge>;
  if (days <= 90) return <Badge variant="warning">{days}d left</Badge>;
  return <Badge variant="success">{days}d left</Badge>;
}

interface ObjectRow {
  id: string;
  vault: string;
  resourceGroup: string;
  kind: KeyVaultObjectKind;
  kindLabel: string;
  name: string;
  enabled: boolean;
  created: string;
  ageDays: number | null;
  updated: string;
  expiry: string;
  daysLeft: number;
  hasExpiry: boolean;
}

const KindIcon = ({ kind }: { kind: KeyVaultObjectKind }) => {
  if (kind === "keys") return <Key className="h-3.5 w-3.5" />;
  if (kind === "secrets") return <FileLock2 className="h-3.5 w-3.5" />;
  return <ScrollText className="h-3.5 w-3.5" />;
};

const columns: DataColumn<ObjectRow>[] = [
  {
    key: "name",
    header: "Object",
    accessor: (r) => r.name,
    cell: (r) => <span className="font-medium">{r.name}</span>,
  },
  {
    key: "kind",
    header: "Type",
    accessor: (r) => r.kindLabel,
    cell: (r) => (
      <Badge variant="outline" className="gap-1">
        <KindIcon kind={r.kind} />
        {r.kindLabel}
      </Badge>
    ),
  },
  { key: "vault", header: "Vault", accessor: (r) => r.vault },
  { key: "rg", header: "Resource Group", accessor: (r) => r.resourceGroup },
  {
    key: "enabled",
    header: "Enabled",
    accessor: (r) => (r.enabled ? "yes" : "no"),
    cell: (r) =>
      r.enabled ? (
        <Badge variant="success">Enabled</Badge>
      ) : (
        <Badge variant="secondary">Disabled</Badge>
      ),
  },
  {
    key: "created",
    header: "Commissioned",
    accessor: (r) => r.created,
    cell: (r) => (
      <span>
        {r.created}
        {r.ageDays !== null && (
          <span className="ml-1 text-muted-foreground">({r.ageDays}d ago)</span>
        )}
      </span>
    ),
  },
  { key: "updated", header: "Last Updated", accessor: (r) => r.updated },
  { key: "expiry", header: "Expires", accessor: (r) => r.expiry },
  {
    key: "days",
    header: "Status",
    accessor: (r) => (Number.isFinite(r.daysLeft) ? r.daysLeft : Number.MAX_SAFE_INTEGER),
    cell: (r) => expiryBadge(r.daysLeft, r.hasExpiry),
  },
];

/* ------------------------------------------------------------------- page */

type KindFilter = "all" | KeyVaultObjectKind;

export default function KeyVaultObjectsPage() {
  const activeId = useSubscriptionStore((s) => s.activeId);
  const activeName = useSubscriptionStore((s) => s.activeName);
  const [filter, setFilter] = useState<KindFilter>("all");

  // 1) Management plane: list the vaults so we know their data-plane URIs.
  const vaultsQuery = useArmList<KeyVault>(
    "/providers/Microsoft.KeyVault/vaults",
    ArmApi.keyvault,
  );

  const vaultRefs: VaultRef[] = useMemo(
    () =>
      (vaultsQuery.data?.value ?? []).map((v) => ({
        name: v.name,
        // Fall back to the conventional endpoint when vaultUri is absent
        // (e.g. offline demo estates don't carry it).
        vaultUri: v.properties?.vaultUri ?? `https://${v.name}.vault.azure.net/`,
        resourceGroup: resourceGroupFromId(v.id),
      })),
    [vaultsQuery.data],
  );

  // 2) Data plane: fan out keys/secrets/certificates across every vault.
  const { records, errors, isLoading, allFailed } = useVaultObjects(vaultRefs);

  const rows: ObjectRow[] = useMemo(() => {
    const mapped = records.map((rec) => {
      const attrs = rec.item.attributes ?? {};
      const idUrl = rec.item.kid ?? rec.item.id;
      const daysLeft = daysUntilEpoch(attrs.exp);
      return {
        id: `${rec.vault}|${rec.kind}|${idUrl ?? objectNameFromId(idUrl)}`,
        vault: rec.vault,
        resourceGroup: rec.resourceGroup,
        kind: rec.kind,
        kindLabel: KIND_LABEL[rec.kind],
        name: objectNameFromId(idUrl),
        enabled: attrs.enabled ?? true,
        created: fmtEpoch(attrs.created),
        ageDays: daysSinceEpoch(attrs.created),
        updated: fmtEpoch(attrs.updated),
        expiry: fmtEpoch(attrs.exp),
        daysLeft,
        hasExpiry: Number.isFinite(daysLeft),
      } satisfies ObjectRow;
    });
    // Soonest-to-expire first; objects without expiry sink to the bottom.
    mapped.sort((a, b) => {
      const av = a.hasExpiry ? a.daysLeft : Number.MAX_SAFE_INTEGER;
      const bv = b.hasExpiry ? b.daysLeft : Number.MAX_SAFE_INTEGER;
      return av - bv;
    });
    return mapped;
  }, [records]);

  const visibleRows = useMemo(
    () => (filter === "all" ? rows : rows.filter((r) => r.kind === filter)),
    [rows, filter],
  );

  const stats = useMemo(() => {
    const withExpiry = rows.filter((r) => r.hasExpiry);
    return {
      total: rows.length,
      expired: withExpiry.filter((r) => r.daysLeft < 0).length,
      soon30: withExpiry.filter((r) => r.daysLeft >= 0 && r.daysLeft <= 30).length,
      soon90: withExpiry.filter((r) => r.daysLeft >= 0 && r.daysLeft <= 90).length,
      disabled: rows.filter((r) => !r.enabled).length,
      keys: rows.filter((r) => r.kind === "keys").length,
      secrets: rows.filter((r) => r.kind === "secrets").length,
      certs: rows.filter((r) => r.kind === "certificates").length,
    };
  }, [rows]);

  if (!activeId) return <NoSubscriptionState />;

  // Distinct vaults we couldn't read at all (typically data-plane 403s).
  const deniedVaults = Array.from(new Set(errors.map((e) => e.vault)));
  const anyAccessError = errors.length > 0;

  return (
    <>
      <PageHeader
        icon={<KeyRound className="h-5 w-5" />}
        title="Key Vault Objects & Expiry"
        description={`Keys, secrets and certificates across every vault in ${activeName ?? "this subscription"}, with commission and expiry dates.`}
        actions={
          <ExportButtons
            filenameBase="key_vault_objects"
            title="Key Vault Objects & Expiry"
            subtitle={activeName ?? undefined}
            rows={rows}
            columns={[
              { header: "Object", accessor: (r) => r.name },
              { header: "Type", accessor: (r) => r.kindLabel },
              { header: "Vault", accessor: (r) => r.vault },
              { header: "Resource Group", accessor: (r) => r.resourceGroup },
              { header: "Enabled", accessor: (r) => (r.enabled ? "yes" : "no") },
              { header: "Commissioned", accessor: (r) => r.created },
              { header: "Age (days)", accessor: (r) => (r.ageDays ?? "") },
              { header: "Last Updated", accessor: (r) => r.updated },
              { header: "Expires", accessor: (r) => r.expiry },
              {
                header: "Days Left",
                accessor: (r) => (r.hasExpiry && Number.isFinite(r.daysLeft) ? r.daysLeft : ""),
              },
            ]}
          />
        }
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        <StatCard label="Objects" value={stats.total} icon={<KeyRound className="h-4 w-4" />} loading={isLoading} />
        <StatCard
          label="Expired"
          value={stats.expired}
          icon={<ShieldAlert className="h-4 w-4" />}
          deltaTone={stats.expired > 0 ? "negative" : "positive"}
          loading={isLoading}
        />
        <StatCard label="Expiring ≤ 30d" value={stats.soon30} icon={<CalendarClock className="h-4 w-4" />} loading={isLoading} />
        <StatCard label="Expiring ≤ 90d" value={stats.soon90} loading={isLoading} />
        <StatCard label="Disabled" value={stats.disabled} loading={isLoading} />
        <StatCard
          label="Keys / Secrets / Certs"
          value={`${stats.keys} / ${stats.secrets} / ${stats.certs}`}
          loading={isLoading}
        />
      </div>

      {(stats.expired > 0 || stats.soon30 > 0) && (
        <Alert variant="destructive">
          <ShieldAlert className="h-4 w-4" />
          <AlertTitle>
            {stats.expired + stats.soon30} object{stats.expired + stats.soon30 === 1 ? "" : "s"} expired or expiring within 30 days
          </AlertTitle>
          <AlertDescription>
            Rotate or renew before expiry — a lapsed key, secret, or certificate can break signing,
            authentication, and TLS on anything that depends on it.
          </AlertDescription>
        </Alert>
      )}

      {anyAccessError && (
        <Alert variant={allFailed ? "destructive" : "default"}>
          <AlertTitle>
            {allFailed ? "No vault objects could be read" : "Some vaults could not be read"}
          </AlertTitle>
          <AlertDescription>
            {deniedVaults.length} vault{deniedVaults.length === 1 ? "" : "s"} returned an access
            error ({deniedVaults.slice(0, 5).join(", ")}
            {deniedVaults.length > 5 ? "…" : ""}). Listing objects needs a Key Vault{" "}
            <em>data-plane</em> grant on each vault — assign the sign-in identity the{" "}
            <strong>Key Vault Reader</strong> role (plus <strong>Key Vault Secrets User</strong> /{" "}
            <strong>Crypto User</strong> for RBAC vaults), or a legacy access policy with{" "}
            <code>get</code> + <code>list</code> on keys, secrets, and certificates.
          </AlertDescription>
        </Alert>
      )}

      <Tabs value={filter} onValueChange={(v) => setFilter(v as KindFilter)}>
        <TabsList>
          <TabsTrigger value="all">All ({stats.total})</TabsTrigger>
          <TabsTrigger value="keys">Keys ({stats.keys})</TabsTrigger>
          <TabsTrigger value="secrets">Secrets ({stats.secrets})</TabsTrigger>
          <TabsTrigger value="certificates">Certificates ({stats.certs})</TabsTrigger>
        </TabsList>
      </Tabs>

      <DataTable
        rows={visibleRows}
        columns={columns}
        isLoading={isLoading || vaultsQuery.isLoading}
        isError={vaultsQuery.isError}
        error={vaultsQuery.error}
        searchPlaceholder="Filter by object, vault, resource group…"
        emptyMessage={
          vaultRefs.length === 0
            ? "No Key Vaults found in this subscription."
            : "No keys, secrets, or certificates were returned. Check data-plane permissions on the vaults."
        }
        getRowId={(r) => r.id}
      />
    </>
  );
}
