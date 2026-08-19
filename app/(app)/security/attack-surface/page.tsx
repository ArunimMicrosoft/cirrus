"use client";

import { Radar, ShieldAlert, Globe } from "lucide-react";
import { PageHeader } from "@/components/data/PageHeader";
import { StatCard } from "@/components/data/StatCard";
import { DataTable, type DataColumn } from "@/components/data/DataTable";
import { NoSubscriptionState } from "@/components/data/NoSubscriptionState";
import { ExportButtons } from "@/components/data/ExportButtons";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useArmList } from "@/lib/hooks/use-arm";
import { useSubscriptionStore } from "@/lib/hooks/use-subscription";
import { ArmApi } from "@/lib/azure/arm";
import { resourceGroupFromId } from "@/lib/utils";

type Sev = "critical" | "high" | "normal";

const CRIT_PORTS: Record<string, string> = {
  "22": "SSH",
  "3389": "RDP",
  "23": "Telnet",
  "5985": "WinRM",
  "5986": "WinRM",
};
const HIGH_PORTS: Record<string, string> = {
  "1433": "SQL Server",
  "3306": "MySQL",
  "5432": "PostgreSQL",
  "6379": "Redis",
  "27017": "MongoDB",
  "1521": "Oracle",
  "445": "SMB",
  "139": "NetBIOS",
  "21": "FTP",
};
const OPEN_SOURCES = new Set(["*", "0.0.0.0/0", "internet", "any"]);

function isOpenSource(src?: string, srcs?: string[]): boolean {
  const all = [src, ...(srcs ?? [])].filter(Boolean) as string[];
  return all.some((s) => OPEN_SOURCES.has(s.trim().toLowerCase()));
}

interface ExposureRow {
  id: string;
  nsg: string;
  resourceGroup: string;
  rule: string;
  source: string;
  ports: string;
  service: string;
  severity: Sev;
}

interface NsgLite {
  id: string;
  name: string;
  location: string;
  properties?: {
    securityRules?: Array<{
      name: string;
      properties: {
        direction?: string;
        access?: string;
        sourceAddressPrefix?: string;
        sourceAddressPrefixes?: string[];
        destinationPortRange?: string;
        destinationPortRanges?: string[];
      };
    }>;
  };
}

interface PipLite {
  id: string;
  name: string;
  location: string;
  properties?: { ipAddress?: string; publicIPAllocationMethod?: string };
}
interface SqlLite {
  id: string;
  name: string;
  properties?: { publicNetworkAccess?: string };
}
interface StorageLite {
  id: string;
  name: string;
  properties?: { allowBlobPublicAccess?: boolean; supportsHttpsTrafficOnly?: boolean };
}

function classify(ports: string[]): { service: string; severity: Sev } {
  let severity: Sev = "normal";
  const names: string[] = [];
  for (const p of ports) {
    if (p === "*" || p === "0-65535") {
      severity = "critical";
      names.push("ALL");
    } else if (CRIT_PORTS[p]) {
      severity = "critical";
      names.push(CRIT_PORTS[p]);
    } else if (HIGH_PORTS[p]) {
      if (severity !== "critical") severity = "high";
      names.push(HIGH_PORTS[p]);
    }
  }
  return { service: names.length ? [...new Set(names)].join(", ") : "custom", severity };
}

const SEV_BADGE: Record<Sev, "destructive" | "warning" | "secondary"> = {
  critical: "destructive",
  high: "warning",
  normal: "secondary",
};

const columns: DataColumn<ExposureRow>[] = [
  { key: "nsg", header: "NSG", accessor: (r) => r.nsg, cell: (r) => <span className="font-medium">{r.nsg}</span> },
  { key: "rule", header: "Rule", accessor: (r) => r.rule },
  { key: "rg", header: "Resource Group", accessor: (r) => r.resourceGroup },
  { key: "source", header: "Source", accessor: (r) => r.source },
  { key: "ports", header: "Ports", accessor: (r) => r.ports },
  {
    key: "severity",
    header: "Exposure",
    accessor: (r) => r.severity,
    cell: (r) => (
      <Badge variant={SEV_BADGE[r.severity]}>
        {r.severity === "normal" ? r.service : `${r.service}`}
      </Badge>
    ),
  },
];

export default function AttackSurfacePage() {
  const activeId = useSubscriptionStore((s) => s.activeId);
  const activeName = useSubscriptionStore((s) => s.activeName);

  const nsgs = useArmList<NsgLite>("/providers/Microsoft.Network/networkSecurityGroups", ArmApi.network);
  const pips = useArmList<PipLite>("/providers/Microsoft.Network/publicIPAddresses", ArmApi.network);
  const sql = useArmList<SqlLite>("/providers/Microsoft.Sql/servers", ArmApi.sql);
  const storage = useArmList<StorageLite>("/providers/Microsoft.Storage/storageAccounts", ArmApi.storage);

  const rows: ExposureRow[] = [];
  for (const nsg of nsgs.data?.value ?? []) {
    for (const rule of nsg.properties?.securityRules ?? []) {
      const p = rule.properties;
      if (p.direction !== "Inbound" || p.access !== "Allow") continue;
      if (!isOpenSource(p.sourceAddressPrefix, p.sourceAddressPrefixes)) continue;
      const ports = [p.destinationPortRange, ...(p.destinationPortRanges ?? [])].filter(Boolean) as string[];
      const { service, severity } = classify(ports);
      rows.push({
        id: `${nsg.id}/${rule.name}`,
        nsg: nsg.name,
        resourceGroup: resourceGroupFromId(nsg.id),
        rule: rule.name,
        source: (p.sourceAddressPrefix || (p.sourceAddressPrefixes ?? []).join(", ") || "*"),
        ports: ports.join(", ") || "*",
        service,
        severity,
      });
    }
  }
  rows.sort((a, b) => {
    const rank = { critical: 0, high: 1, normal: 2 };
    return rank[a.severity] - rank[b.severity];
  });

  const critical = rows.filter((r) => r.severity === "critical").length;
  const publicIps = (pips.data?.value ?? []).filter((p) => p.properties?.ipAddress).length;
  const publicSql = (sql.data?.value ?? []).filter((s) => (s.properties?.publicNetworkAccess ?? "Enabled") === "Enabled");
  const publicStorage = (storage.data?.value ?? []).filter(
    (s) => s.properties?.allowBlobPublicAccess || s.properties?.supportsHttpsTrafficOnly === false,
  );
  const publicPaas = publicSql.length + publicStorage.length;

  const loading = nsgs.isLoading || pips.isLoading || sql.isLoading || storage.isLoading;

  if (!activeId) return <NoSubscriptionState />;

  return (
    <>
      <PageHeader
        icon={<Radar className="h-5 w-5" />}
        title="Attack Surface"
        description="Everything reachable from the public internet: NSG rules open to any source, public IPs, and PaaS services with public network access."
        actions={
          <ExportButtons
            filenameBase="attack-surface"
            title="Internet Attack Surface"
            subtitle={activeName ?? undefined}
            rows={rows}
            columns={[
              { header: "NSG", accessor: (r) => r.nsg },
              { header: "Rule", accessor: (r) => r.rule },
              { header: "Resource Group", accessor: (r) => r.resourceGroup },
              { header: "Source", accessor: (r) => r.source },
              { header: "Ports", accessor: (r) => r.ports },
              { header: "Service", accessor: (r) => r.service },
              { header: "Severity", accessor: (r) => r.severity },
            ]}
          />
        }
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Critical exposures" value={critical} icon={<ShieldAlert className="h-4 w-4" />} loading={loading} />
        <StatCard label="Internet-open rules" value={rows.length} loading={loading} />
        <StatCard label="Public IP addresses" value={publicIps} icon={<Globe className="h-4 w-4" />} loading={loading} />
        <StatCard label="Public PaaS services" value={publicPaas} loading={loading} />
      </div>

      {critical > 0 && (
        <Alert variant="destructive">
          <ShieldAlert className="h-4 w-4" />
          <AlertTitle>
            {critical} critical path{critical === 1 ? "" : "s"} open to the internet
          </AlertTitle>
          <AlertDescription>
            Remote-admin (SSH/RDP/WinRM) or wide-open rules are reachable from any source.
            These are the first routes an attacker would probe — tighten the source to a
            known range or a bastion.
          </AlertDescription>
        </Alert>
      )}

      <DataTable
        rows={rows}
        columns={columns}
        isLoading={loading}
        isError={nsgs.isError}
        error={nsgs.error}
        searchPlaceholder="Filter by NSG, rule, port…"
        emptyMessage="No NSG rules are open to the public internet. Nicely locked down."
        getRowId={(r) => r.id}
      />

      {publicPaas > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Publicly reachable PaaS</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {publicSql.map((s) => (
              <div key={s.id} className="flex items-center gap-2 rounded-md border bg-card/60 px-3 py-2">
                <Badge variant="warning">SQL</Badge>
                <span className="font-medium">{s.name}</span>
                <span className="ml-auto text-xs text-muted-foreground">public network access enabled</span>
              </div>
            ))}
            {publicStorage.map((s) => (
              <div key={s.id} className="flex items-center gap-2 rounded-md border bg-card/60 px-3 py-2">
                <Badge variant="warning">Storage</Badge>
                <span className="font-medium">{s.name}</span>
                <span className="ml-auto text-xs text-muted-foreground">
                  {s.properties?.allowBlobPublicAccess ? "public blob access" : "HTTP allowed"}
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </>
  );
}
