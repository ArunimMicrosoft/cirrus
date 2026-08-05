"use client";

import { useQueries } from "@tanstack/react-query";
import { Server, Loader2 } from "lucide-react";
import { PageHeader } from "@/components/data/PageHeader";
import { DataTable, type DataColumn } from "@/components/data/DataTable";
import { NoSubscriptionState } from "@/components/data/NoSubscriptionState";
import { ExportButtons } from "@/components/data/ExportButtons";
import { useArmList } from "@/lib/hooks/use-arm";
import { useSubscriptionStore } from "@/lib/hooks/use-subscription";
import { ArmApi } from "@/lib/azure/arm";
import type { VirtualMachine } from "@/lib/azure/types";
import { resourceGroupFromId } from "@/lib/utils";
import { classifyHardening } from "@/lib/azure/hardening";
import { Badge } from "@/components/ui/badge";
import { api } from "@/lib/api-client";

interface InstanceView {
  statuses?: Array<{ code?: string; displayStatus?: string }>;
}

interface VmRow {
  id: string;
  name: string;
  status: string; // running | deallocated | stopped | starting | stopping | unknown | loading
  statusLoading: boolean;
  resourceGroup: string;
  region: string;
  vmSize: string;
  osType: string;
  imageType: string;
  hardeningLabel: string;
  hardeningLevel: string;
  publisher: string;
  offer: string;
  sku: string;
}

/**
 * Extract the current power state (running / deallocated / stopped / etc.)
 * from an instanceView status list. Azure returns statuses as an array of
 * codes like "PowerState/running" — this returns the suffix after the slash.
 */
function powerStateFromInstanceView(iv: InstanceView | undefined): string | null {
  for (const s of iv?.statuses ?? []) {
    const code = s.code ?? "";
    if (code.startsWith("PowerState/")) {
      return code.split("/").pop() ?? null;
    }
  }
  return null;
}

function statusBadge(state: string, loading: boolean) {
  if (loading) {
    return (
      <Badge variant="outline" className="gap-1">
        <Loader2 className="h-3 w-3 animate-spin" />
        loading
      </Badge>
    );
  }
  const s = state.toLowerCase();
  if (s === "running") return <Badge variant="success">running</Badge>;
  if (s === "deallocated") return <Badge variant="warning">deallocated</Badge>;
  if (s === "stopped") return <Badge variant="secondary">stopped</Badge>;
  if (s === "starting")
    return (
      <Badge variant="secondary" className="gap-1">
        <Loader2 className="h-3 w-3 animate-spin" />
        starting
      </Badge>
    );
  if (s === "stopping" || s === "deallocating")
    return (
      <Badge variant="secondary" className="gap-1">
        <Loader2 className="h-3 w-3 animate-spin" />
        {state}
      </Badge>
    );
  return <Badge variant="outline">{state}</Badge>;
}

function statusBadgeCell(row: VmRow) {
  return statusBadge(row.status, row.statusLoading);
}

function hardeningBadge(row: VmRow) {
  const variantMap: Record<string, "success" | "warning" | "outline"> = {
    cis: "success",
    stig: "success",
    "azure-baseline": "success",
    hardened: "warning",
    standard: "outline",
  };
  return (
    <Badge variant={variantMap[row.hardeningLevel] ?? "outline"}>
      {row.hardeningLabel}
    </Badge>
  );
}

const columns: DataColumn<VmRow>[] = [
  {
    key: "name",
    header: "Name",
    accessor: (r) => r.name,
    cell: (r) => <span className="font-medium">{r.name}</span>,
  },
  {
    key: "status",
    header: "Status",
    accessor: (r) => r.status,
    cell: statusBadgeCell,
  },
  { key: "rg", header: "Resource Group", accessor: (r) => r.resourceGroup },
  { key: "region", header: "Region", accessor: (r) => r.region },
  { key: "size", header: "VM Size", accessor: (r) => r.vmSize },
  { key: "os", header: "OS", accessor: (r) => r.osType },
  { key: "image", header: "Image", accessor: (r) => r.imageType },
  {
    key: "hardening",
    header: "Hardening",
    accessor: (r) => r.hardeningLabel,
    cell: hardeningBadge,
  },
];

export default function VirtualMachinesPage() {
  const activeId = useSubscriptionStore((s) => s.activeId);
  const activeName = useSubscriptionStore((s) => s.activeName);
  const { data, isLoading, isError, error } = useArmList<VirtualMachine>(
    "/providers/Microsoft.Compute/virtualMachines",
    ArmApi.computeVms,
  );

  const vmList = data?.value ?? [];

  // Per-VM instanceView fan-out. Azure's subscription-scoped VM list does
  // not return power state — we have to hit /instanceView on each VM to get
  // it. React Query dedupes and caches each call.
  const instanceViewQueries = useQueries({
    queries: vmList.map((vm) => ({
      queryKey: ["vm-instanceview", activeId, vm.id],
      queryFn: () => {
        if (!activeId) throw new Error("No active subscription");
        const rg = resourceGroupFromId(vm.id);
        const path =
          `/resourceGroups/${encodeURIComponent(rg)}` +
          `/providers/Microsoft.Compute/virtualMachines/${encodeURIComponent(vm.name)}` +
          `/instanceView`;
        return api.arm<InstanceView>(activeId, path, ArmApi.computeVms);
      },
      enabled: Boolean(activeId),
      staleTime: 30_000,
      retry: 1,
    })),
  });

  const rows: VmRow[] = vmList.map((vm, idx) => {
    const q = instanceViewQueries[idx];
    const ps = q?.data ? powerStateFromInstanceView(q.data) : null;
    const status = ps ?? (q?.isError ? "unknown" : "unknown");
    const statusLoading = q?.isLoading ?? false;

    const hardware = vm.properties?.hardwareProfile;
    const storage = vm.properties?.storageProfile;
    const img = storage?.imageReference;
    const publisher = img?.publisher ?? "Unknown";
    const offer = img?.offer ?? "Unknown";
    const sku = img?.sku ?? "Unknown";
    const hardening = classifyHardening(publisher, offer, sku);

    return {
      id: vm.id,
      name: vm.name,
      status,
      statusLoading,
      resourceGroup: resourceGroupFromId(vm.id),
      region: vm.location,
      vmSize: hardware?.vmSize ?? "N/A",
      osType: storage?.osDisk?.osType ?? "N/A",
      imageType: `${publisher}/${offer}`,
      hardeningLabel: hardening.label,
      hardeningLevel: hardening.level,
      publisher,
      offer,
      sku,
    };
  });

  const runningCount = rows.filter((r) => r.status.toLowerCase() === "running").length;
  const deallocatedCount = rows.filter(
    (r) => r.status.toLowerCase() === "deallocated",
  ).length;
  const pendingStatus = rows.filter((r) => r.statusLoading).length;

  if (!activeId) return <NoSubscriptionState />;

  return (
    <>
      <PageHeader
        icon={<Server className="h-5 w-5" />}
        title="Virtual Machines"
        description={
          rows.length === 0
            ? `Virtual machines in ${activeName ?? "the selected subscription"}.`
            : pendingStatus > 0
            ? `${rows.length} VMs · ${runningCount} running · ${deallocatedCount} deallocated · resolving ${pendingStatus} status${pendingStatus === 1 ? "" : "es"}…`
            : `${rows.length} VMs · ${runningCount} running · ${deallocatedCount} deallocated`
        }
        actions={
          <ExportButtons
            filenameBase="virtual_machines"
            title="Virtual Machines Report"
            subtitle={activeName ?? undefined}
            rows={rows}
            columns={[
              { header: "Name", accessor: (r) => r.name },
              { header: "Status", accessor: (r) => r.status },
              { header: "Resource Group", accessor: (r) => r.resourceGroup },
              { header: "Region", accessor: (r) => r.region },
              { header: "VM Size", accessor: (r) => r.vmSize },
              { header: "OS Type", accessor: (r) => r.osType },
              { header: "Image Type", accessor: (r) => r.imageType },
              { header: "Hardening", accessor: (r) => r.hardeningLabel },
              { header: "Publisher", accessor: (r) => r.publisher },
              { header: "Offer", accessor: (r) => r.offer },
              { header: "SKU", accessor: (r) => r.sku },
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
        searchPlaceholder="Filter by name, region, RG or size…"
        emptyMessage="No virtual machines found in this subscription."
        getRowId={(r) => r.id}
      />
    </>
  );
}
