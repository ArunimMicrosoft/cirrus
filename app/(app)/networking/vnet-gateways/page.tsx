"use client";

import { Router } from "lucide-react";
import { PageHeader } from "@/components/data/PageHeader";
import { DataTable, type DataColumn } from "@/components/data/DataTable";
import { NoSubscriptionState } from "@/components/data/NoSubscriptionState";
import { ExportButtons } from "@/components/data/ExportButtons";
import { useArmList } from "@/lib/hooks/use-arm";
import { useSubscriptionStore } from "@/lib/hooks/use-subscription";
import { ArmApi } from "@/lib/azure/arm";
import type { VirtualNetworkGateway } from "@/lib/azure/types";
import { resourceGroupFromId } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

interface GwRow {
  id: string;
  name: string;
  resourceGroup: string;
  region: string;
  gatewayType: string;
  vpnType: string;
  generation: string;
  sku: string;
  bgp: boolean;
  activeActive: boolean;
  isBasic: boolean;
  isPolicyBased: boolean;
}

function toRow(g: VirtualNetworkGateway): GwRow {
  const p = g.properties ?? {};
  const sku = p.sku?.name ?? "—";
  const gatewayType = p.gatewayType ?? "—";
  const vpnType = gatewayType === "Vpn" ? p.vpnType ?? "RouteBased" : "—";
  return {
    id: g.id,
    name: g.name,
    resourceGroup: resourceGroupFromId(g.id),
    region: g.location,
    gatewayType,
    vpnType,
    generation: p.vpnGatewayGeneration && p.vpnGatewayGeneration !== "None" ? p.vpnGatewayGeneration : "—",
    sku,
    bgp: Boolean(p.enableBgp),
    activeActive: Boolean(p.activeActive),
    isBasic: /basic/i.test(sku),
    isPolicyBased: gatewayType === "Vpn" && vpnType === "PolicyBased",
  };
}

const columns: DataColumn<GwRow>[] = [
  { key: "name", header: "Name", accessor: (r) => r.name, cell: (r) => <span className="font-medium">{r.name}</span> },
  { key: "rg", header: "Resource Group", accessor: (r) => r.resourceGroup },
  { key: "region", header: "Region", accessor: (r) => r.region },
  {
    key: "type",
    header: "Type",
    accessor: (r) => r.gatewayType,
    cell: (r) => <Badge variant={r.gatewayType === "ExpressRoute" ? "secondary" : "outline"}>{r.gatewayType}</Badge>,
  },
  {
    key: "vpnType",
    header: "VPN Type",
    accessor: (r) => r.vpnType,
    cell: (r) =>
      r.isPolicyBased ? <Badge variant="warning">PolicyBased · single tunnel</Badge> : <span className="text-xs">{r.vpnType}</span>,
  },
  { key: "gen", header: "Generation", accessor: (r) => r.generation },
  {
    key: "sku",
    header: "SKU",
    accessor: (r) => r.sku,
    cell: (r) => (r.isBasic ? <Badge variant="destructive">{r.sku} · no SLA / legacy</Badge> : <Badge variant="secondary">{r.sku}</Badge>),
  },
  { key: "bgp", header: "BGP", accessor: (r) => (r.bgp ? "on" : "off") },
  {
    key: "ha",
    header: "Redundancy",
    accessor: (r) => (r.activeActive ? "active-active" : "single"),
    cell: (r) =>
      r.gatewayType === "Vpn" && !r.activeActive ? (
        <Badge variant="warning">Single instance</Badge>
      ) : (
        <span className="text-xs">{r.activeActive ? "active-active" : "—"}</span>
      ),
  },
];

export default function VnetGatewaysPage() {
  const activeId = useSubscriptionStore((s) => s.activeId);
  const activeName = useSubscriptionStore((s) => s.activeName);
  const { data, isLoading, isError, error } = useArmList<VirtualNetworkGateway>(
    "/providers/Microsoft.Network/virtualNetworkGateways",
    ArmApi.network,
  );

  const rows = (data?.value ?? []).map(toRow);
  const vpn = rows.filter((r) => r.gatewayType === "Vpn").length;
  const er = rows.filter((r) => r.gatewayType === "ExpressRoute").length;
  const basic = rows.filter((r) => r.isBasic).length;
  const single = rows.filter((r) => r.gatewayType === "Vpn" && !r.activeActive).length;

  const description =
    rows.length === 0
      ? `No virtual network gateways found in ${activeName ?? "the selected subscription"}.`
      : [
          `${rows.length} gateway${rows.length === 1 ? "" : "s"}`,
          `${vpn} VPN · ${er} ExpressRoute`,
          basic > 0 ? `${basic} on Basic SKU` : null,
          single > 0 ? `${single} not active-active` : null,
        ]
          .filter(Boolean)
          .join(" · ");

  if (!activeId) return <NoSubscriptionState />;

  return (
    <>
      <PageHeader
        icon={<Router className="h-5 w-5" />}
        title="Virtual Network Gateways (VPN / ExpressRoute)"
        description={description}
        actions={
          <ExportButtons
            filenameBase="vnet_gateways"
            title="Virtual Network Gateways Report"
            subtitle={activeName ?? undefined}
            rows={rows}
            columns={[
              { header: "Name", accessor: (r) => r.name },
              { header: "Resource Group", accessor: (r) => r.resourceGroup },
              { header: "Region", accessor: (r) => r.region },
              { header: "Type", accessor: (r) => r.gatewayType },
              { header: "VPN Type", accessor: (r) => r.vpnType },
              { header: "Generation", accessor: (r) => r.generation },
              { header: "SKU", accessor: (r) => r.sku },
              { header: "BGP", accessor: (r) => (r.bgp ? "on" : "off") },
              { header: "Active-Active", accessor: (r) => (r.activeActive ? "yes" : "no") },
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
        searchPlaceholder="Filter by name, type, or SKU…"
        emptyMessage="No virtual network gateways found in this subscription."
        getRowId={(r) => r.id}
      />
    </>
  );
}
