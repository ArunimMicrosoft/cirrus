"use client";

import { Cable } from "lucide-react";
import { PageHeader } from "@/components/data/PageHeader";
import { DataTable, type DataColumn } from "@/components/data/DataTable";
import { NoSubscriptionState } from "@/components/data/NoSubscriptionState";
import { ExportButtons } from "@/components/data/ExportButtons";
import { useArmList } from "@/lib/hooks/use-arm";
import { useSubscriptionStore } from "@/lib/hooks/use-subscription";
import { ArmApi } from "@/lib/azure/arm";
import type { ExpressRouteCircuit } from "@/lib/azure/types";
import { resourceGroupFromId } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

interface ErRow {
  id: string;
  name: string;
  resourceGroup: string;
  region: string;
  provider: string;
  peeringLocation: string;
  /** Bandwidth in Mbps (normalised from Gbps for ER Direct). */
  bandwidthMbps: number;
  bandwidthLabel: string;
  tier: string;
  circuitState: string;
  providerState: string;
  provisioned: boolean;
  peerings: string;
}

/** Human bandwidth label from a Mbps figure. */
function bandwidthLabel(mbps: number): string {
  if (!mbps) return "—";
  return mbps >= 1000 ? `${(mbps / 1000).toFixed(mbps % 1000 === 0 ? 0 : 1)} Gbps` : `${mbps} Mbps`;
}

function toRow(c: ExpressRouteCircuit): ErRow {
  const p = c.properties ?? {};
  const spp = p.serviceProviderProperties ?? {};
  // Classic circuits report Mbps via the provider block; ER Direct reports Gbps.
  const mbps = spp.bandwidthInMbps ?? (p.bandwidthInGbps ? p.bandwidthInGbps * 1000 : 0);
  const providerState = p.serviceProviderProvisioningState ?? "Unknown";
  const peeringTypes = (p.peerings ?? [])
    .map((pr) => pr.properties?.peeringType)
    .filter(Boolean) as string[];
  return {
    id: c.id,
    name: c.name,
    resourceGroup: resourceGroupFromId(c.id),
    region: c.location,
    provider: spp.serviceProviderName ?? (p.bandwidthInGbps ? "ExpressRoute Direct" : "—"),
    peeringLocation: spp.peeringLocation ?? "—",
    bandwidthMbps: mbps,
    bandwidthLabel: bandwidthLabel(mbps),
    tier: c.sku?.tier ?? "Standard",
    circuitState: p.circuitProvisioningState ?? "—",
    providerState,
    provisioned: providerState === "Provisioned",
    peerings: peeringTypes.length ? [...new Set(peeringTypes)].join(", ") : "none",
  };
}

const columns: DataColumn<ErRow>[] = [
  {
    key: "name",
    header: "Name",
    accessor: (r) => r.name,
    cell: (r) => <span className="font-medium">{r.name}</span>,
  },
  { key: "rg", header: "Resource Group", accessor: (r) => r.resourceGroup },
  { key: "region", header: "Region", accessor: (r) => r.region },
  { key: "provider", header: "Provider", accessor: (r) => r.provider },
  { key: "peeringLocation", header: "Peering Location", accessor: (r) => r.peeringLocation },
  {
    key: "bandwidth",
    header: "Bandwidth",
    accessor: (r) => r.bandwidthMbps,
    cell: (r) => <span className="font-mono text-xs">{r.bandwidthLabel}</span>,
  },
  {
    key: "tier",
    header: "SKU",
    accessor: (r) => r.tier,
    cell: (r) => (
      <Badge variant={r.tier === "Premium" ? "secondary" : "outline"}>{r.tier}</Badge>
    ),
  },
  {
    key: "peerings",
    header: "Peerings",
    accessor: (r) => r.peerings,
    cell: (r) =>
      r.peerings === "none" ? (
        <Badge variant="warning">No peering configured</Badge>
      ) : (
        <span className="text-xs">{r.peerings}</span>
      ),
  },
  {
    key: "state",
    header: "Provider status",
    accessor: (r) => r.providerState,
    cell: (r) =>
      r.provisioned ? (
        <Badge variant="secondary">Provisioned</Badge>
      ) : (
        <Badge variant="destructive">{r.providerState} · billing with no link</Badge>
      ),
  },
];

export default function ExpressRoutePage() {
  const activeId = useSubscriptionStore((s) => s.activeId);
  const activeName = useSubscriptionStore((s) => s.activeName);
  const { data, isLoading, isError, error } = useArmList<ExpressRouteCircuit>(
    "/providers/Microsoft.Network/expressRouteCircuits",
    ArmApi.network,
  );

  const rows = (data?.value ?? []).map(toRow);
  const totalMbps = rows.reduce((s, r) => s + r.bandwidthMbps, 0);
  const unprovisioned = rows.filter((r) => !r.provisioned).length;
  const noPeering = rows.filter((r) => r.peerings === "none").length;

  const description =
    rows.length === 0
      ? `No ExpressRoute circuits found in ${activeName ?? "the selected subscription"}.`
      : [
          `${rows.length} circuit${rows.length === 1 ? "" : "s"}`,
          `${bandwidthLabel(totalMbps)} provisioned`,
          unprovisioned > 0 ? `${unprovisioned} awaiting provider link` : null,
          noPeering > 0 ? `${noPeering} without peering` : null,
        ]
          .filter(Boolean)
          .join(" · ");

  if (!activeId) return <NoSubscriptionState />;

  return (
    <>
      <PageHeader
        icon={<Cable className="h-5 w-5" />}
        title="ExpressRoute Circuits"
        description={description}
        actions={
          <ExportButtons
            filenameBase="expressroute_circuits"
            title="ExpressRoute Circuits Report"
            subtitle={activeName ?? undefined}
            rows={rows}
            columns={[
              { header: "Name", accessor: (r) => r.name },
              { header: "Resource Group", accessor: (r) => r.resourceGroup },
              { header: "Region", accessor: (r) => r.region },
              { header: "Provider", accessor: (r) => r.provider },
              { header: "Peering Location", accessor: (r) => r.peeringLocation },
              { header: "Bandwidth", accessor: (r) => r.bandwidthLabel },
              { header: "SKU", accessor: (r) => r.tier },
              { header: "Peerings", accessor: (r) => r.peerings },
              { header: "Circuit State", accessor: (r) => r.circuitState },
              { header: "Provider Status", accessor: (r) => r.providerState },
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
        searchPlaceholder="Filter by name, provider, or peering location…"
        emptyMessage="No ExpressRoute circuits found in this subscription."
        getRowId={(r) => r.id}
      />
    </>
  );
}
