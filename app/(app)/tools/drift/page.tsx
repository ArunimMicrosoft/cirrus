"use client";

import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  GitCompare,
  Camera,
  Trash2,
  ArrowRight,
  ShieldCheck,
  HardDrive,
} from "lucide-react";
import { PageHeader } from "@/components/data/PageHeader";
import { DataTable, type DataColumn } from "@/components/data/DataTable";
import { NoSubscriptionState } from "@/components/data/NoSubscriptionState";
import { ExportButtons } from "@/components/data/ExportButtons";
import { StatCard } from "@/components/data/StatCard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { api } from "@/lib/api-client";
import { ArmApi } from "@/lib/azure/arm";
import { useSubscriptionStore } from "@/lib/hooks/use-subscription";
import * as idb from "@/lib/idb";
import type {
  AppService,
  Disk,
  NetworkSecurityGroup,
  PublicIpAddress,
  ResourceGroup,
  StorageAccount,
  VirtualMachine,
} from "@/lib/azure/types";

interface SnapshotPayload {
  resourceGroups: Record<string, ResourceGroup>;
  vms: Record<string, VirtualMachine>;
  disks: Record<string, Disk>;
  nsgs: Record<string, NetworkSecurityGroup>;
  publicIps: Record<string, PublicIpAddress>;
  storage: Record<string, StorageAccount>;
  webapps: Record<string, AppService>;
}

const RESOURCE_KEYS: Array<{ key: keyof SnapshotPayload; label: string }> = [
  { key: "resourceGroups", label: "Resource Group" },
  { key: "vms", label: "Virtual Machine" },
  { key: "disks", label: "Disk" },
  { key: "nsgs", label: "NSG" },
  { key: "publicIps", label: "Public IP" },
  { key: "storage", label: "Storage Account" },
  { key: "webapps", label: "App Service" },
];

interface DiffRow {
  id: string;
  change: "ADD" | "REMOVE" | "MODIFY";
  type: string;
  resource: string;
  detail: string;
}

/**
 * Reduce each resource to a compact fingerprint keyed by name. We drop most
 * of the ARM response because we only need enough to diff meaningfully:
 * name, location, key security properties, and top-level SKU / size.
 */
function keyByName<T extends { name: string }>(rows: T[]): Record<string, T> {
  const out: Record<string, T> = {};
  for (const r of rows) out[r.name] = r;
  return out;
}

function diffSnapshots(a: SnapshotPayload, b: SnapshotPayload): DiffRow[] {
  const rows: DiffRow[] = [];
  for (const { key, label } of RESOURCE_KEYS) {
    const before = (a[key] ?? {}) as Record<string, unknown>;
    const after = (b[key] ?? {}) as Record<string, unknown>;
    const beforeKeys = new Set(Object.keys(before));
    const afterKeys = new Set(Object.keys(after));

    for (const k of afterKeys) {
      if (!beforeKeys.has(k)) {
        rows.push({
          id: `add-${label}-${k}`,
          change: "ADD",
          type: label,
          resource: k,
          detail: "new resource",
        });
      }
    }
    for (const k of beforeKeys) {
      if (!afterKeys.has(k)) {
        rows.push({
          id: `rm-${label}-${k}`,
          change: "REMOVE",
          type: label,
          resource: k,
          detail: "resource removed",
        });
      }
    }
    for (const k of afterKeys) {
      if (!beforeKeys.has(k)) continue;
      const bStr = JSON.stringify(before[k]);
      const aStr = JSON.stringify(after[k]);
      if (bStr !== aStr) {
        rows.push({
          id: `mod-${label}-${k}`,
          change: "MODIFY",
          type: label,
          resource: k,
          detail: propertyDelta(before[k], after[k]),
        });
      }
    }
  }
  return rows;
}

function propertyDelta(before: unknown, after: unknown): string {
  const b = (before ?? {}) as Record<string, unknown>;
  const a = (after ?? {}) as Record<string, unknown>;
  const changes: string[] = [];
  for (const k of new Set([...Object.keys(b), ...Object.keys(a)])) {
    if (k === "id" || k === "name") continue;
    const bv = JSON.stringify(b[k]);
    const av = JSON.stringify(a[k]);
    if (bv !== av) changes.push(`${k}: ${truncate(bv)} → ${truncate(av)}`);
    if (changes.length >= 3) break;
  }
  return changes.length > 0 ? changes.join("; ") : "properties changed";
}

function truncate(s: string | undefined): string {
  if (!s) return "-";
  return s.length > 40 ? `${s.slice(0, 37)}…` : s;
}

async function captureAll(subscriptionId: string): Promise<SnapshotPayload> {
  const [rgs, vms, disks, nsgs, pips, storage, apps] = await Promise.all([
    api.armList<ResourceGroup>(subscriptionId, "/resourcegroups", ArmApi.resourceGroups),
    api.armList<VirtualMachine>(
      subscriptionId,
      "/providers/Microsoft.Compute/virtualMachines",
      ArmApi.computeVms,
    ),
    api.armList<Disk>(
      subscriptionId,
      "/providers/Microsoft.Compute/disks",
      ArmApi.computeDisks,
    ),
    api.armList<NetworkSecurityGroup>(
      subscriptionId,
      "/providers/Microsoft.Network/networkSecurityGroups",
      ArmApi.network,
    ),
    api.armList<PublicIpAddress>(
      subscriptionId,
      "/providers/Microsoft.Network/publicIPAddresses",
      ArmApi.network,
    ),
    api.armList<StorageAccount>(
      subscriptionId,
      "/providers/Microsoft.Storage/storageAccounts",
      ArmApi.storage,
    ),
    api.armList<AppService>(
      subscriptionId,
      "/providers/Microsoft.Web/sites",
      ArmApi.web,
    ),
  ]);
  return {
    resourceGroups: keyByName(rgs.value),
    vms: keyByName(vms.value),
    disks: keyByName(disks.value),
    nsgs: keyByName(nsgs.value),
    publicIps: keyByName(pips.value),
    storage: keyByName(storage.value),
    webapps: keyByName(apps.value),
  };
}

function summarize(payload: SnapshotPayload): Record<string, number> {
  return {
    resourceGroups: Object.keys(payload.resourceGroups).length,
    vms: Object.keys(payload.vms).length,
    disks: Object.keys(payload.disks).length,
    nsgs: Object.keys(payload.nsgs).length,
    publicIps: Object.keys(payload.publicIps).length,
    storage: Object.keys(payload.storage).length,
    webapps: Object.keys(payload.webapps).length,
  };
}

function defaultName(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `snap_${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}`;
}

export default function DriftPage() {
  const activeId = useSubscriptionStore((s) => s.activeId);
  const activeName = useSubscriptionStore((s) => s.activeName);
  const qc = useQueryClient();

  // ---- List of stored snapshots (browser-local) ----
  const snapshots = useQuery({
    queryKey: ["drift-idb", activeId],
    queryFn: () => (activeId ? idb.listSnapshots(activeId) : Promise.resolve([])),
    enabled: Boolean(activeId),
    staleTime: 5_000,
  });

  const [snapshotName, setSnapshotName] = React.useState("");

  const capture = useMutation({
    mutationFn: async () => {
      if (!activeId) throw new Error("No active subscription");
      const finalName = snapshotName.trim() || defaultName();
      if (!/^[a-zA-Z0-9._-]+$/.test(finalName)) {
        throw new Error("Name may only contain letters, numbers, dot, dash, underscore");
      }
      const payload = await captureAll(activeId);
      await idb.putSnapshot({
        subscriptionId: activeId,
        name: finalName,
        createdAt: new Date().toISOString(),
        summary: summarize(payload),
        payload,
      });
      return finalName;
    },
    onSuccess: () => {
      setSnapshotName("");
      qc.invalidateQueries({ queryKey: ["drift-idb", activeId] });
    },
  });

  const remove = useMutation({
    mutationFn: async (name: string) => {
      if (!activeId) return;
      await idb.deleteSnapshot(activeId, name);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["drift-idb", activeId] });
    },
  });

  // ---- Compare picker + diff ----
  const list = snapshots.data ?? [];
  const [beforeName, setBeforeName] = React.useState("");
  const [afterName, setAfterName] = React.useState("");

  React.useEffect(() => {
    if (list.length >= 2) {
      if (!beforeName || !list.some((s) => s.name === beforeName)) {
        setBeforeName(list[1].name);
      }
      if (!afterName || !list.some((s) => s.name === afterName)) {
        setAfterName(list[0].name);
      }
    } else if (list.length === 1) {
      setBeforeName(list[0].name);
      setAfterName("");
    } else {
      setBeforeName("");
      setAfterName("");
    }
  }, [list, beforeName, afterName]);

  const before = list.find((s) => s.name === beforeName);
  const after = list.find((s) => s.name === afterName);
  const diff = React.useMemo(() => {
    if (!before || !after) return [];
    return diffSnapshots(
      before.payload as SnapshotPayload,
      after.payload as SnapshotPayload,
    );
  }, [before, after]);

  const adds = diff.filter((d) => d.change === "ADD").length;
  const removes = diff.filter((d) => d.change === "REMOVE").length;
  const mods = diff.filter((d) => d.change === "MODIFY").length;

  const diffColumns: DataColumn<DiffRow>[] = [
    {
      key: "change",
      header: "Change",
      accessor: (r) => r.change,
      cell: (r) => {
        if (r.change === "ADD") return <Badge variant="success">➕ ADD</Badge>;
        if (r.change === "REMOVE") return <Badge variant="destructive">➖ REMOVE</Badge>;
        return <Badge variant="warning">🔄 MODIFY</Badge>;
      },
    },
    { key: "type", header: "Type", accessor: (r) => r.type },
    {
      key: "resource",
      header: "Resource",
      accessor: (r) => r.resource,
      cell: (r) => <span className="font-mono text-xs">{r.resource}</span>,
    },
    {
      key: "detail",
      header: "Detail",
      accessor: (r) => r.detail,
      cell: (r) => (
        <span className="line-clamp-2 text-xs" title={r.detail}>
          {r.detail}
        </span>
      ),
    },
  ];

  const snapshotColumns: DataColumn<idb.StoredSnapshot>[] = [
    {
      key: "name",
      header: "Name",
      accessor: (r) => r.name,
      cell: (r) => <span className="font-medium">{r.name}</span>,
    },
    {
      key: "created",
      header: "Captured",
      accessor: (r) => r.createdAt,
      cell: (r) => (
        <span className="text-xs tabular-nums">
          {new Date(r.createdAt).toLocaleString()}
        </span>
      ),
    },
    {
      key: "summary",
      header: "Summary",
      accessor: (r) =>
        Object.entries(r.summary)
          .map(([k, v]) => `${k}:${v}`)
          .join(", "),
      cell: (r) => (
        <span className="text-xs text-muted-foreground">
          VMs {r.summary.vms ?? 0} · Disks {r.summary.disks ?? 0} · NSGs {r.summary.nsgs ?? 0} · Storage {r.summary.storage ?? 0}
        </span>
      ),
    },
    {
      key: "actions",
      header: "",
      accessor: () => "",
      cell: (r) => (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => remove.mutate(r.name)}
          disabled={remove.isPending}
          title="Delete snapshot from your browser (Azure is untouched)"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      ),
    },
  ];

  if (!activeId) return <NoSubscriptionState />;

  return (
    <>
      <PageHeader
        icon={<GitCompare className="h-5 w-5" />}
        title="Cloud Drift Detector"
        description={`Snapshot ${activeName ?? "this subscription"} and compare snapshots over time. Storage is your browser (IndexedDB) — nothing leaves your machine.`}
      />

      <Alert variant="success">
        <HardDrive className="h-4 w-4" />
        <AlertTitle>Snapshots live in your browser</AlertTitle>
        <AlertDescription>
          Each snapshot is stored in this browser's IndexedDB (origin-bound,
          per-user, per-device). Azure is never modified. "Delete snapshot"
          removes it from your browser only. Clearing site data will wipe your
          history.
        </AlertDescription>
      </Alert>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Capture new snapshot</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap items-end gap-3">
          <div className="min-w-[240px] flex-1">
            <Label className="mb-1 block text-xs">Snapshot name</Label>
            <Input
              value={snapshotName}
              onChange={(e) => setSnapshotName(e.target.value)}
              placeholder={defaultName()}
            />
          </div>
          <Button onClick={() => capture.mutate()} disabled={capture.isPending}>
            <Camera className="h-4 w-4" />
            {capture.isPending ? "Capturing…" : "Capture snapshot"}
          </Button>
          {capture.isError && (
            <p className="w-full text-xs text-destructive">
              {capture.error instanceof Error
                ? capture.error.message
                : String(capture.error)}
            </p>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard
          label="Stored snapshots"
          value={list.length}
          delta="per browser · per subscription"
          loading={snapshots.isLoading}
        />
        <StatCard
          label="Additions"
          value={adds}
          deltaTone={adds > 0 ? "positive" : "default"}
        />
        <StatCard
          label="Removals"
          value={removes}
          deltaTone={removes > 0 ? "negative" : "default"}
        />
        <StatCard
          label="Modifications"
          value={mods}
          deltaTone={mods > 0 ? "negative" : "default"}
        />
      </div>

      {list.length >= 2 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm">
              Compare
              <span className="text-muted-foreground">baseline → target</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap items-end gap-3">
            <div>
              <Label className="mb-1 block text-xs">Baseline</Label>
              <Select value={beforeName} onValueChange={setBeforeName}>
                <SelectTrigger className="w-64">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {list.map((s) => (
                    <SelectItem key={s.name} value={s.name}>
                      {s.name} · {new Date(s.createdAt).toLocaleString()}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <ArrowRight className="mb-2 h-4 w-4 text-muted-foreground" />
            <div>
              <Label className="mb-1 block text-xs">Target</Label>
              <Select value={afterName} onValueChange={setAfterName}>
                <SelectTrigger className="w-64">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {list.map((s) => (
                    <SelectItem key={s.name} value={s.name}>
                      {s.name} · {new Date(s.createdAt).toLocaleString()}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {diff.length > 0 && (
              <div className="ml-auto">
                <ExportButtons
                  filenameBase={`drift_${beforeName}_to_${afterName}`}
                  title={`Drift: ${beforeName} → ${afterName}`}
                  rows={diff}
                  columns={[
                    { header: "Change", accessor: (r) => r.change },
                    { header: "Type", accessor: (r) => r.type },
                    { header: "Resource", accessor: (r) => r.resource },
                    { header: "Detail", accessor: (r) => r.detail },
                  ]}
                />
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {before && after && diff.length > 0 && (
        <DataTable
          rows={diff}
          columns={diffColumns}
          searchPlaceholder="Filter drift…"
          emptyMessage="No differences detected."
          pageSize={30}
          getRowId={(r) => r.id}
        />
      )}
      {before && after && diff.length === 0 && (
        <Alert variant="success">
          <ShieldCheck className="h-4 w-4" />
          <AlertTitle>No drift detected</AlertTitle>
          <AlertDescription>
            The two snapshots have identical resource fingerprints.
          </AlertDescription>
        </Alert>
      )}

      <div>
        <h2 className="mb-3 text-sm font-semibold text-muted-foreground">
          Stored snapshots
        </h2>
        <DataTable
          rows={list}
          columns={snapshotColumns}
          isLoading={snapshots.isLoading}
          searchPlaceholder={null}
          emptyMessage="No snapshots yet. Capture one above to get started."
          getRowId={(r) => r.name}
        />
      </div>
    </>
  );
}
