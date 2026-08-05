"use client";

import { HardDrive, Lock, Unlock } from "lucide-react";
import { PageHeader } from "@/components/data/PageHeader";
import { DataTable, type DataColumn } from "@/components/data/DataTable";
import { NoSubscriptionState } from "@/components/data/NoSubscriptionState";
import { ExportButtons } from "@/components/data/ExportButtons";
import { useArmList } from "@/lib/hooks/use-arm";
import { useSubscriptionStore } from "@/lib/hooks/use-subscription";
import { ArmApi } from "@/lib/azure/arm";
import type { StorageAccount } from "@/lib/azure/types";
import { resourceGroupFromId } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

interface StorageRow {
  id: string;
  name: string;
  resourceGroup: string;
  region: string;
  sku: string;
  kind: string;
  accessTier: string;
  httpsOnly: boolean;
  allowsPublicBlob: boolean;
  networkDefault: string;
}

function toRow(sa: StorageAccount): StorageRow {
  return {
    id: sa.id,
    name: sa.name,
    resourceGroup: resourceGroupFromId(sa.id),
    region: sa.location,
    sku: sa.sku?.name ?? "Unknown",
    kind: sa.kind ?? "Unknown",
    accessTier: sa.properties?.accessTier ?? "-",
    httpsOnly: sa.properties?.supportsHttpsTrafficOnly ?? true,
    allowsPublicBlob: sa.properties?.allowBlobPublicAccess ?? false,
    networkDefault: sa.properties?.networkAcls?.defaultAction ?? "Allow",
  };
}

const columns: DataColumn<StorageRow>[] = [
  {
    key: "name",
    header: "Name",
    accessor: (r) => r.name,
    cell: (r) => <span className="font-medium">{r.name}</span>,
  },
  { key: "rg", header: "Resource Group", accessor: (r) => r.resourceGroup },
  { key: "region", header: "Region", accessor: (r) => r.region },
  {
    key: "sku",
    header: "SKU",
    accessor: (r) => r.sku,
    cell: (r) => <Badge variant="secondary">{r.sku}</Badge>,
  },
  { key: "kind", header: "Kind", accessor: (r) => r.kind },
  { key: "tier", header: "Access Tier", accessor: (r) => r.accessTier },
  {
    key: "https",
    header: "HTTPS-only",
    accessor: (r) => (r.httpsOnly ? "yes" : "no"),
    cell: (r) =>
      r.httpsOnly ? (
        <Badge variant="success">
          <Lock className="mr-1 h-3 w-3" />
          Enforced
        </Badge>
      ) : (
        <Badge variant="destructive">
          <Unlock className="mr-1 h-3 w-3" />
          HTTP allowed
        </Badge>
      ),
  },
  {
    key: "public",
    header: "Public Blob",
    accessor: (r) => (r.allowsPublicBlob ? "yes" : "no"),
    cell: (r) =>
      r.allowsPublicBlob ? (
        <Badge variant="destructive">Allowed</Badge>
      ) : (
        <Badge variant="success">Blocked</Badge>
      ),
  },
  {
    key: "netdefault",
    header: "Network Default",
    accessor: (r) => r.networkDefault,
    cell: (r) =>
      r.networkDefault.toLowerCase() === "deny" ? (
        <Badge variant="success">Deny</Badge>
      ) : (
        <Badge variant="warning">Allow</Badge>
      ),
  },
];

export default function StorageAccountsPage() {
  const activeId = useSubscriptionStore((s) => s.activeId);
  const activeName = useSubscriptionStore((s) => s.activeName);
  const { data, isLoading, isError, error } = useArmList<StorageAccount>(
    "/providers/Microsoft.Storage/storageAccounts",
    ArmApi.storage,
  );

  const rows = (data?.value ?? []).map(toRow);
  const httpAllowed = rows.filter((r) => !r.httpsOnly).length;
  const publicBlob = rows.filter((r) => r.allowsPublicBlob).length;

  if (!activeId) return <NoSubscriptionState />;

  return (
    <>
      <PageHeader
        icon={<HardDrive className="h-5 w-5" />}
        title="Storage Accounts"
        description={`Blob, file, queue, and table storage in ${activeName ?? "the selected subscription"}.`}
        actions={
          <ExportButtons
            filenameBase="storage_accounts"
            title="Storage Accounts Report"
            subtitle={activeName ?? undefined}
            rows={rows}
            columns={[
              { header: "Name", accessor: (r) => r.name },
              { header: "Resource Group", accessor: (r) => r.resourceGroup },
              { header: "Region", accessor: (r) => r.region },
              { header: "SKU", accessor: (r) => r.sku },
              { header: "Kind", accessor: (r) => r.kind },
              { header: "Access Tier", accessor: (r) => r.accessTier },
              { header: "HTTPS Only", accessor: (r) => (r.httpsOnly ? "yes" : "no") },
              { header: "Allow Blob Public Access", accessor: (r) => (r.allowsPublicBlob ? "yes" : "no") },
              { header: "Network Default", accessor: (r) => r.networkDefault },
            ]}
          />
        }
      />

      {(httpAllowed > 0 || publicBlob > 0) && (
        <Alert variant="destructive">
          <AlertTitle>Security findings</AlertTitle>
          <AlertDescription>
            {httpAllowed > 0 && (
              <div>
                {httpAllowed} storage account{httpAllowed === 1 ? "" : "s"} allow
                HTTP. Enable "secure transfer required".
              </div>
            )}
            {publicBlob > 0 && (
              <div>
                {publicBlob} storage account{publicBlob === 1 ? "" : "s"} allow
                anonymous blob access.
              </div>
            )}
          </AlertDescription>
        </Alert>
      )}

      <DataTable
        rows={rows}
        columns={columns}
        isLoading={isLoading}
        isError={isError}
        error={error}
        searchPlaceholder="Filter by name, SKU, or kind…"
        emptyMessage="No storage accounts found in this subscription."
        getRowId={(r) => r.id}
      />
    </>
  );
}
