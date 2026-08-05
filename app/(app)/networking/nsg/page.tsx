"use client";

import { Shield, ShieldAlert } from "lucide-react";
import Link from "next/link";
import { PageHeader } from "@/components/data/PageHeader";
import { DataTable, type DataColumn } from "@/components/data/DataTable";
import { NoSubscriptionState } from "@/components/data/NoSubscriptionState";
import { ExportButtons } from "@/components/data/ExportButtons";
import { useArmList } from "@/lib/hooks/use-arm";
import { useSubscriptionStore } from "@/lib/hooks/use-subscription";
import { ArmApi } from "@/lib/azure/arm";
import type { NetworkSecurityGroup } from "@/lib/azure/types";
import { resourceGroupFromId } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

interface NsgRow {
  id: string;
  name: string;
  resourceGroup: string;
  region: string;
  ruleCount: number;
  attachedNics: number;
  attachedSubnets: number;
  riskyRules: number;
  criticalPortsExposed: string[];
}

const CRITICAL_PORTS = new Set(["22", "3389", "1433", "3306", "5432"]);
const OPEN_SOURCES = new Set(["*", "0.0.0.0/0", "Internet"]);

function analyzeNsg(nsg: NetworkSecurityGroup): NsgRow {
  const rules = nsg.properties?.securityRules ?? [];
  const critical = new Set<string>();
  let risky = 0;
  for (const rule of rules) {
    const p = rule.properties;
    if (p.direction !== "Inbound" || p.access !== "Allow") continue;
    const src = p.sourceAddressPrefix ?? "";
    const port = p.destinationPortRange ?? "";
    if (OPEN_SOURCES.has(src)) {
      if (port === "*" || CRITICAL_PORTS.has(port)) {
        risky++;
        if (port === "*") critical.add("ALL");
        else critical.add(port);
      }
    }
  }
  return {
    id: nsg.id,
    name: nsg.name,
    resourceGroup: resourceGroupFromId(nsg.id),
    region: nsg.location,
    ruleCount: rules.length,
    attachedNics: nsg.properties?.networkInterfaces?.length ?? 0,
    attachedSubnets: nsg.properties?.subnets?.length ?? 0,
    riskyRules: risky,
    criticalPortsExposed: [...critical],
  };
}

const columns: DataColumn<NsgRow>[] = [
  {
    key: "name",
    header: "Name",
    accessor: (r) => r.name,
    cell: (r) => <span className="font-medium">{r.name}</span>,
  },
  { key: "rg", header: "Resource Group", accessor: (r) => r.resourceGroup },
  { key: "region", header: "Region", accessor: (r) => r.region },
  {
    key: "rules",
    header: "Rules",
    accessor: (r) => r.ruleCount,
    cell: (r) => <span className="tabular-nums">{r.ruleCount}</span>,
  },
  {
    key: "attached",
    header: "Attached to",
    accessor: (r) => r.attachedNics + r.attachedSubnets,
    cell: (r) => {
      if (r.attachedNics === 0 && r.attachedSubnets === 0)
        return <Badge variant="outline">Orphaned</Badge>;
      return (
        <span className="text-xs text-muted-foreground">
          {r.attachedNics} NIC · {r.attachedSubnets} subnet
        </span>
      );
    },
  },
  {
    key: "risk",
    header: "Risk",
    accessor: (r) => r.riskyRules,
    cell: (r) => {
      if (r.riskyRules === 0)
        return <Badge variant="success">Safe</Badge>;
      const ports = r.criticalPortsExposed.join(", ");
      return (
        <Badge variant="destructive" title={`Ports open to Internet: ${ports}`}>
          <ShieldAlert className="mr-1 h-3 w-3" />
          {r.riskyRules} rule{r.riskyRules === 1 ? "" : "s"} · {ports}
        </Badge>
      );
    },
  },
];

export default function NsgPage() {
  const activeId = useSubscriptionStore((s) => s.activeId);
  const activeName = useSubscriptionStore((s) => s.activeName);
  const { data, isLoading, isError, error } = useArmList<NetworkSecurityGroup>(
    "/providers/Microsoft.Network/networkSecurityGroups",
    ArmApi.network,
  );

  const rows = (data?.value ?? []).map(analyzeNsg);
  const totalRisky = rows.reduce((sum, r) => sum + r.riskyRules, 0);
  const orphaned = rows.filter((r) => r.attachedNics === 0 && r.attachedSubnets === 0).length;

  if (!activeId) return <NoSubscriptionState />;

  return (
    <>
      <PageHeader
        icon={<Shield className="h-5 w-5" />}
        title="Network Security Groups"
        description={`Inbound/outbound firewall rules. ${totalRisky > 0 ? `${totalRisky} risky rule${totalRisky === 1 ? "" : "s"} detected.` : "No critical ports exposed to Internet."}`}
        actions={
          <ExportButtons
            filenameBase="nsgs"
            title="Network Security Groups Report"
            subtitle={activeName ?? undefined}
            rows={rows}
            columns={[
              { header: "Name", accessor: (r) => r.name },
              { header: "Resource Group", accessor: (r) => r.resourceGroup },
              { header: "Region", accessor: (r) => r.region },
              { header: "Rules", accessor: (r) => r.ruleCount },
              { header: "NICs Attached", accessor: (r) => r.attachedNics },
              { header: "Subnets Attached", accessor: (r) => r.attachedSubnets },
              { header: "Risky Rules", accessor: (r) => r.riskyRules },
              { header: "Critical Ports Exposed", accessor: (r) => r.criticalPortsExposed.join(", ") },
            ]}
          />
        }
      />

      {totalRisky > 0 && (
        <Alert variant="destructive">
          <ShieldAlert className="h-4 w-4" />
          <AlertTitle>
            {totalRisky} NSG rule{totalRisky === 1 ? "" : "s"} open critical ports to the Internet
          </AlertTitle>
          <AlertDescription>
            Ports 22 / 3389 / 1433 / 3306 / 5432 should never be exposed to
            source {"'*'"} or 0.0.0.0/0. Use the{" "}
            <Link href="/networking/flow" className="font-medium underline">
              Network Flow Analyzer
            </Link>{" "}
            to inspect individual rules.
          </AlertDescription>
        </Alert>
      )}

      {orphaned > 0 && (
        <Alert>
          <AlertTitle>
            {orphaned} orphaned NSG{orphaned === 1 ? "" : "s"} (not attached to any NIC or subnet)
          </AlertTitle>
          <AlertDescription>
            Orphaned NSGs consume no resources but clutter your inventory.
            Review in Orphan Resources.
          </AlertDescription>
        </Alert>
      )}

      <DataTable
        rows={rows}
        columns={columns}
        isLoading={isLoading}
        isError={isError}
        error={error}
        searchPlaceholder="Filter by name or region…"
        emptyMessage="No NSGs found in this subscription."
        getRowId={(r) => r.id}
      />
    </>
  );
}
