"use client";

import { Trash2, HardDrive, Network, Shield, Camera } from "lucide-react";
import { PageHeader } from "@/components/data/PageHeader";
import { DataTable, type DataColumn } from "@/components/data/DataTable";
import { NoSubscriptionState } from "@/components/data/NoSubscriptionState";
import { ExportButtons } from "@/components/data/ExportButtons";
import { StatCard } from "@/components/data/StatCard";
import { useArmList } from "@/lib/hooks/use-arm";
import { useSubscriptionStore } from "@/lib/hooks/use-subscription";
import { ArmApi } from "@/lib/azure/arm";
import { formatCurrency, resourceGroupFromId } from "@/lib/utils";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import type {
  Disk,
  NetworkInterface,
  NetworkSecurityGroup,
  PublicIpAddress,
} from "@/lib/azure/types";
import {
  estimateDiskMonthlyCost,
  estimatePublicIpMonthlyCost,
  estimateSnapshotMonthlyCost,
} from "@/lib/azure/prices";

interface OrphanRow {
  id: string;
  type: string;
  name: string;
  resourceGroup: string;
  location: string;
  sizeGb?: number;
  sku?: string;
  ageDays?: number;
  estMonthly: number;
  reason: string;
}

interface Snapshot {
  id: string;
  name: string;
  location: string;
  properties?: { diskSizeGB?: number; timeCreated?: string };
  sku?: { name: string };
}

export default function OrphansPage() {
  const activeId = useSubscriptionStore((s) => s.activeId);
  const activeName = useSubscriptionStore((s) => s.activeName);

  const disks = useArmList<Disk>(
    "/providers/Microsoft.Compute/disks",
    ArmApi.computeDisks,
  );
  const pips = useArmList<PublicIpAddress>(
    "/providers/Microsoft.Network/publicIPAddresses",
    ArmApi.network,
  );
  const nics = useArmList<NetworkInterface>(
    "/providers/Microsoft.Network/networkInterfaces",
    ArmApi.network,
  );
  const nsgs = useArmList<NetworkSecurityGroup>(
    "/providers/Microsoft.Network/networkSecurityGroups",
    ArmApi.network,
  );
  const snapshots = useArmList<Snapshot>(
    "/providers/Microsoft.Compute/snapshots",
    ArmApi.computeSnapshots,
  );

  const rows: OrphanRow[] = [];

  disks.data?.value.forEach((d) => {
    if (d.managedBy) return;
    const size = d.properties?.diskSizeGB ?? 0;
    const cost = estimateDiskMonthlyCost(d.sku?.name ?? "", size);
    rows.push({
      id: d.id,
      type: "Managed Disk",
      name: d.name,
      resourceGroup: resourceGroupFromId(d.id),
      location: d.location,
      sizeGb: size,
      sku: d.sku?.name,
      estMonthly: cost,
      reason: "Not attached to any VM",
    });
  });

  pips.data?.value.forEach((p) => {
    if (p.properties?.ipConfiguration) return;
    rows.push({
      id: p.id,
      type: "Public IP",
      name: p.name,
      resourceGroup: resourceGroupFromId(p.id),
      location: p.location,
      sku: p.sku?.name,
      estMonthly: estimatePublicIpMonthlyCost(),
      reason: "Not attached to any resource",
    });
  });

  nics.data?.value.forEach((n) => {
    if (n.properties?.virtualMachine?.id) return;
    rows.push({
      id: n.id,
      type: "Network Interface",
      name: n.name,
      resourceGroup: resourceGroupFromId(n.id),
      location: n.location,
      estMonthly: 0,
      reason: "Not attached to any VM",
    });
  });

  nsgs.data?.value.forEach((g) => {
    const attached =
      (g.properties?.networkInterfaces?.length ?? 0) +
      (g.properties?.subnets?.length ?? 0);
    if (attached > 0) return;
    rows.push({
      id: g.id,
      type: "NSG",
      name: g.name,
      resourceGroup: resourceGroupFromId(g.id),
      location: g.location,
      estMonthly: 0,
      reason: "Not attached to any NIC or subnet",
    });
  });

  const now = Date.now();
  snapshots.data?.value.forEach((s) => {
    const created = s.properties?.timeCreated ? Date.parse(s.properties.timeCreated) : NaN;
    if (!Number.isFinite(created)) return;
    const ageDays = Math.floor((now - created) / (1000 * 60 * 60 * 24));
    if (ageDays < 30) return; // only flag snapshots older than 30 days
    const size = s.properties?.diskSizeGB ?? 0;
    rows.push({
      id: s.id,
      type: "Snapshot",
      name: s.name,
      resourceGroup: resourceGroupFromId(s.id),
      location: s.location,
      sizeGb: size,
      ageDays,
      estMonthly: estimateSnapshotMonthlyCost(size),
      reason: `Older than 30 days (${ageDays}d)`,
    });
  });

  const totalMonthly = rows.reduce((sum, r) => sum + r.estMonthly, 0);
  const byType = new Map<string, { count: number; cost: number }>();
  rows.forEach((r) => {
    const cur = byType.get(r.type) ?? { count: 0, cost: 0 };
    byType.set(r.type, { count: cur.count + 1, cost: cur.cost + r.estMonthly });
  });

  const iconFor = (t: string) => {
    if (t === "Managed Disk" || t === "Snapshot")
      return <HardDrive className="h-4 w-4" />;
    if (t === "Public IP") return <Network className="h-4 w-4" />;
    if (t === "NSG") return <Shield className="h-4 w-4" />;
    return <Trash2 className="h-4 w-4" />;
  };

  const columns: DataColumn<OrphanRow>[] = [
    {
      key: "type",
      header: "Type",
      accessor: (r) => r.type,
      cell: (r) => (
        <div className="flex items-center gap-1.5">
          {iconFor(r.type)}
          <span className="font-medium">{r.type}</span>
        </div>
      ),
    },
    { key: "name", header: "Name", accessor: (r) => r.name },
    { key: "rg", header: "Resource Group", accessor: (r) => r.resourceGroup },
    { key: "loc", header: "Region", accessor: (r) => r.location },
    {
      key: "size",
      header: "Size",
      accessor: (r) => r.sizeGb ?? "",
      cell: (r) =>
        r.sizeGb != null ? (
          <span className="tabular-nums">{r.sizeGb} GB</span>
        ) : (
          <span className="text-muted-foreground">-</span>
        ),
    },
    { key: "reason", header: "Reason", accessor: (r) => r.reason },
    {
      key: "cost",
      header: "Est. monthly",
      accessor: (r) => r.estMonthly,
      cell: (r) => (
        <span className="tabular-nums font-medium">
          {r.estMonthly > 0 ? formatCurrency(r.estMonthly) : "—"}
        </span>
      ),
    },
  ];

  const anyLoading =
    disks.isLoading || pips.isLoading || nics.isLoading || nsgs.isLoading || snapshots.isLoading;
  const anyError =
    disks.error || pips.error || nics.error || nsgs.error || snapshots.error;

  if (!activeId) return <NoSubscriptionState />;

  return (
    <>
      <PageHeader
        icon={<Trash2 className="h-5 w-5" />}
        title="Orphan Resources"
        description="Unattached disks, unused public IPs, dangling NICs and NSGs, and stale snapshots."
        actions={
          <ExportButtons
            filenameBase="orphan_resources"
            title="Orphan Resources Report"
            subtitle={activeName ?? undefined}
            rows={rows}
            columns={[
              { header: "Type", accessor: (r) => r.type },
              { header: "Name", accessor: (r) => r.name },
              { header: "Resource Group", accessor: (r) => r.resourceGroup },
              { header: "Region", accessor: (r) => r.location },
              { header: "Size (GB)", accessor: (r) => r.sizeGb ?? "" },
              { header: "SKU", accessor: (r) => r.sku ?? "" },
              { header: "Age (days)", accessor: (r) => r.ageDays ?? "" },
              { header: "Reason", accessor: (r) => r.reason },
              { header: "Est. Monthly", accessor: (r) => r.estMonthly.toFixed(2) },
            ]}
          />
        }
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard
          label="Orphans found"
          value={rows.length}
          icon={<Trash2 className="h-4 w-4" />}
          loading={anyLoading}
        />
        <StatCard
          label="Est. monthly waste"
          value={formatCurrency(totalMonthly)}
          delta={`${formatCurrency(totalMonthly * 12)} per year`}
          deltaTone={totalMonthly > 0 ? "negative" : "positive"}
          loading={anyLoading}
        />
        <StatCard
          label="Unattached disks"
          value={byType.get("Managed Disk")?.count ?? 0}
          icon={<HardDrive className="h-4 w-4" />}
          loading={disks.isLoading}
        />
        <StatCard
          label="Old snapshots"
          value={byType.get("Snapshot")?.count ?? 0}
          icon={<Camera className="h-4 w-4" />}
          loading={snapshots.isLoading}
        />
      </div>

      <Alert>
        <AlertTitle>Read-only view</AlertTitle>
        <AlertDescription>
          This app never deletes anything. Review each resource, verify no
          automation depends on it, then delete manually in the Azure Portal or
          via <code className="rounded bg-muted px-1 text-xs">az resource delete</code>.
        </AlertDescription>
      </Alert>

      {anyError && (
        <Alert variant="destructive">
          <AlertTitle>Some resource types failed to load</AlertTitle>
          <AlertDescription>
            {anyError instanceof Error ? anyError.message : String(anyError)}
          </AlertDescription>
        </Alert>
      )}

      <DataTable
        rows={rows}
        columns={columns}
        isLoading={anyLoading}
        isError={false}
        searchPlaceholder="Filter by name, type, or region…"
        emptyMessage="No orphaned resources found. Your subscription is clean."
        getRowId={(r) => r.id}
      />

      {rows.length > 0 && (
        <div className="rounded-lg border bg-card p-4 text-sm">
          <p className="mb-2 font-semibold">Cleanup commands (run manually, outside this app)</p>
          <pre className="overflow-x-auto rounded bg-muted p-3 text-xs">
{`# Delete an unattached disk
az disk delete --ids <resource-id> --yes

# Delete an unused public IP
az network public-ip delete --ids <resource-id>

# Delete an orphaned NSG
az network nsg delete --ids <resource-id>

# Delete an old snapshot
az snapshot delete --ids <resource-id>`}
          </pre>
          <p className="mt-2 text-xs text-muted-foreground">
            Copy each resource ID from the exported CSV. This app has no delete
            capability by design.{" "}
            <Badge variant="success" className="ml-1">
              READ-ONLY
            </Badge>
          </p>
        </div>
      )}
    </>
  );
}
