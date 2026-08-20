"use client";

import { Flame } from "lucide-react";
import { PageHeader } from "@/components/data/PageHeader";
import { DataTable, type DataColumn } from "@/components/data/DataTable";
import { NoSubscriptionState } from "@/components/data/NoSubscriptionState";
import { ExportButtons } from "@/components/data/ExportButtons";
import { useArmList } from "@/lib/hooks/use-arm";
import { useSubscriptionStore } from "@/lib/hooks/use-subscription";
import { ArmApi } from "@/lib/azure/arm";
import type { AzureFirewall } from "@/lib/azure/types";
import { resourceGroupFromId } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

interface FwRow {
  id: string;
  name: string;
  resourceGroup: string;
  region: string;
  tier: string;
  threatIntel: string;
  usesPolicy: boolean;
  publicIps: number;
  zones: number;
  weakThreatIntel: boolean;
  noZones: boolean;
}

function toRow(fw: AzureFirewall): FwRow {
  const p = fw.properties ?? {};
  const tier = fw.sku?.tier ?? "Standard";
  const threatIntel = p.threatIntelMode ?? "Off";
  return {
    id: fw.id,
    name: fw.name,
    resourceGroup: resourceGroupFromId(fw.id),
    region: fw.location,
    tier,
    threatIntel,
    usesPolicy: Boolean(p.firewallPolicy?.id),
    publicIps: (p.ipConfigurations ?? []).filter((c) => c.properties?.publicIPAddress?.id).length,
    zones: (fw.zones ?? []).length,
    weakThreatIntel: threatIntel !== "Deny",
    noZones: (fw.zones ?? []).length === 0,
  };
}

const columns: DataColumn<FwRow>[] = [
  { key: "name", header: "Name", accessor: (r) => r.name, cell: (r) => <span className="font-medium">{r.name}</span> },
  { key: "rg", header: "Resource Group", accessor: (r) => r.resourceGroup },
  { key: "region", header: "Region", accessor: (r) => r.region },
  {
    key: "tier",
    header: "Tier",
    accessor: (r) => r.tier,
    cell: (r) => <Badge variant={r.tier === "Premium" ? "secondary" : r.tier === "Basic" ? "warning" : "outline"}>{r.tier}</Badge>,
  },
  {
    key: "ti",
    header: "Threat Intel",
    accessor: (r) => r.threatIntel,
    cell: (r) =>
      r.threatIntel === "Deny" ? (
        <Badge variant="success">Deny</Badge>
      ) : (
        <Badge variant="warning">{r.threatIntel} · not blocking</Badge>
      ),
  },
  {
    key: "policy",
    header: "Policy",
    accessor: (r) => (r.usesPolicy ? "Firewall Policy" : "Classic rules"),
    cell: (r) =>
      r.usesPolicy ? <span className="text-xs">Firewall Policy</span> : <Badge variant="warning">Classic rules</Badge>,
  },
  { key: "pips", header: "Public IPs", accessor: (r) => r.publicIps },
  {
    key: "zones",
    header: "Zones",
    accessor: (r) => r.zones,
    cell: (r) => (r.noZones ? <Badge variant="warning">None</Badge> : <span className="text-xs">{r.zones}</span>),
  },
];

export default function FirewallsPage() {
  const activeId = useSubscriptionStore((s) => s.activeId);
  const activeName = useSubscriptionStore((s) => s.activeName);
  const { data, isLoading, isError, error } = useArmList<AzureFirewall>(
    "/providers/Microsoft.Network/azureFirewalls",
    ArmApi.network,
  );

  const rows = (data?.value ?? []).map(toRow);
  const weakTi = rows.filter((r) => r.weakThreatIntel).length;
  const classic = rows.filter((r) => !r.usesPolicy).length;
  const noZones = rows.filter((r) => r.noZones).length;

  const description =
    rows.length === 0
      ? `No Azure Firewalls found in ${activeName ?? "the selected subscription"}.`
      : [
          `${rows.length} firewall${rows.length === 1 ? "" : "s"}`,
          weakTi > 0 ? `${weakTi} not in threat-intel Deny mode` : "all in threat-intel Deny mode",
          classic > 0 ? `${classic} on classic rules` : null,
          noZones > 0 ? `${noZones} without zone redundancy` : null,
        ]
          .filter(Boolean)
          .join(" · ");

  if (!activeId) return <NoSubscriptionState />;

  return (
    <>
      <PageHeader
        icon={<Flame className="h-5 w-5" />}
        title="Azure Firewalls"
        description={description}
        actions={
          <ExportButtons
            filenameBase="azure_firewalls"
            title="Azure Firewalls Report"
            subtitle={activeName ?? undefined}
            rows={rows}
            columns={[
              { header: "Name", accessor: (r) => r.name },
              { header: "Resource Group", accessor: (r) => r.resourceGroup },
              { header: "Region", accessor: (r) => r.region },
              { header: "Tier", accessor: (r) => r.tier },
              { header: "Threat Intel", accessor: (r) => r.threatIntel },
              { header: "Policy", accessor: (r) => (r.usesPolicy ? "Firewall Policy" : "Classic rules") },
              { header: "Public IPs", accessor: (r) => String(r.publicIps) },
              { header: "Zones", accessor: (r) => String(r.zones) },
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
        searchPlaceholder="Filter by name, tier, or threat-intel mode…"
        emptyMessage="No Azure Firewalls found in this subscription."
        getRowId={(r) => r.id}
      />
    </>
  );
}
