"use client";

import { Network } from "lucide-react";
import { PageHeader } from "@/components/data/PageHeader";
import { DataTable, type DataColumn } from "@/components/data/DataTable";
import { NoSubscriptionState } from "@/components/data/NoSubscriptionState";
import { ExportButtons } from "@/components/data/ExportButtons";
import { useArmList } from "@/lib/hooks/use-arm";
import { useSubscriptionStore } from "@/lib/hooks/use-subscription";
import { ArmApi } from "@/lib/azure/arm";
import type { PublicIpAddress } from "@/lib/azure/types";
import { resourceGroupFromId } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

interface PipRow {
  id: string;
  name: string;
  resourceGroup: string;
  region: string;
  ipAddress: string;
  allocation: string;
  sku: string;
  attached: boolean;
  attachedTo: string;
}

/** Parse the attached resource type from the ipConfiguration ARM ID. */
function parseAttachedTo(id: string | undefined): string {
  if (!id) return "";
  const parts = id.split("/");
  const providerIdx = parts.indexOf("providers");
  if (providerIdx < 0) return "-";
  // e.g. .../providers/Microsoft.Network/networkInterfaces/<name>/ipConfigurations/...
  const type = parts[providerIdx + 2] ?? "?";
  const name = parts[providerIdx + 3] ?? "?";
  const typeLabels: Record<string, string> = {
    networkInterfaces: "NIC",
    loadBalancers: "Load Balancer",
    applicationGateways: "App Gateway",
    virtualNetworkGateways: "VPN Gateway",
    natGateways: "NAT Gateway",
  };
  return `${typeLabels[type] ?? type}: ${name}`;
}

function toRow(pip: PublicIpAddress): PipRow {
  const cfg = pip.properties?.ipConfiguration?.id;
  return {
    id: pip.id,
    name: pip.name,
    resourceGroup: resourceGroupFromId(pip.id),
    region: pip.location,
    ipAddress: pip.properties?.ipAddress ?? "Not assigned",
    allocation: pip.properties?.publicIPAllocationMethod ?? "-",
    sku: pip.sku?.name ?? "Basic",
    attached: Boolean(cfg),
    attachedTo: parseAttachedTo(cfg),
  };
}

const columns: DataColumn<PipRow>[] = [
  {
    key: "name",
    header: "Name",
    accessor: (r) => r.name,
    cell: (r) => <span className="font-medium">{r.name}</span>,
  },
  { key: "rg", header: "Resource Group", accessor: (r) => r.resourceGroup },
  { key: "region", header: "Region", accessor: (r) => r.region },
  {
    key: "ip",
    header: "IP Address",
    accessor: (r) => r.ipAddress,
    cell: (r) => <span className="font-mono text-xs">{r.ipAddress}</span>,
  },
  {
    key: "alloc",
    header: "Allocation",
    accessor: (r) => r.allocation,
    cell: (r) => (
      <Badge variant={r.allocation === "Static" ? "secondary" : "outline"}>
        {r.allocation}
      </Badge>
    ),
  },
  {
    key: "sku",
    header: "SKU",
    accessor: (r) => r.sku,
    cell: (r) => (
      <Badge variant={r.sku === "Basic" ? "warning" : "secondary"}>{r.sku}</Badge>
    ),
  },
  {
    key: "attached",
    header: "Attached to",
    accessor: (r) => (r.attached ? r.attachedTo : "unattached"),
    cell: (r) =>
      r.attached ? (
        <span className="text-xs">{r.attachedTo}</span>
      ) : (
        <Badge variant="destructive">Unattached · ~$3.65/mo waste</Badge>
      ),
  },
];

export default function PublicIpsPage() {
  const activeId = useSubscriptionStore((s) => s.activeId);
  const activeName = useSubscriptionStore((s) => s.activeName);
  const { data, isLoading, isError, error } = useArmList<PublicIpAddress>(
    "/providers/Microsoft.Network/publicIPAddresses",
    ArmApi.network,
  );

  const rows = (data?.value ?? []).map(toRow);
  const unattached = rows.filter((r) => !r.attached).length;

  if (!activeId) return <NoSubscriptionState />;

  return (
    <>
      <PageHeader
        icon={<Network className="h-5 w-5" />}
        title="Public IP Addresses"
        description={
          unattached > 0
            ? `${unattached} unattached IP${unattached === 1 ? "" : "s"} wasting ~$${(unattached * 3.65).toFixed(2)}/mo`
            : `All public IPs are attached in ${activeName ?? "the selected subscription"}.`
        }
        actions={
          <ExportButtons
            filenameBase="public_ips"
            title="Public IP Addresses Report"
            subtitle={activeName ?? undefined}
            rows={rows}
            columns={[
              { header: "Name", accessor: (r) => r.name },
              { header: "Resource Group", accessor: (r) => r.resourceGroup },
              { header: "Region", accessor: (r) => r.region },
              { header: "IP Address", accessor: (r) => r.ipAddress },
              { header: "Allocation", accessor: (r) => r.allocation },
              { header: "SKU", accessor: (r) => r.sku },
              { header: "Attached", accessor: (r) => (r.attached ? "yes" : "no") },
              { header: "Attached To", accessor: (r) => r.attachedTo },
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
        searchPlaceholder="Filter by name, IP, or region…"
        emptyMessage="No public IPs found in this subscription."
        getRowId={(r) => r.id}
      />
    </>
  );
}
