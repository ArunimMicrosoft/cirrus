"use client";

import * as React from "react";
import { useMutation } from "@tanstack/react-query";
import { Search, PlayCircle, Radio } from "lucide-react";
import { PageHeader } from "@/components/data/PageHeader";
import { DataTable, type DataColumn } from "@/components/data/DataTable";
import { NoSubscriptionState } from "@/components/data/NoSubscriptionState";
import { ExportButtons } from "@/components/data/ExportButtons";
import { StatCard } from "@/components/data/StatCard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { api } from "@/lib/api-client";
import { useSubscriptionStore } from "@/lib/hooks/use-subscription";

interface Template {
  category: string;
  name: string;
  kql: string;
}

const TEMPLATES: Template[] = [
  {
    category: "General",
    name: "All resources by type",
    kql: `Resources
| summarize count() by type
| order by count_ desc`,
  },
  {
    category: "General",
    name: "Resources by location",
    kql: `Resources
| summarize count() by location
| order by count_ desc`,
  },
  {
    category: "Compute",
    name: "All virtual machines",
    kql: `Resources
| where type =~ 'Microsoft.Compute/virtualMachines'
| project name, location, resourceGroup, size = tostring(properties.hardwareProfile.vmSize), os = tostring(properties.storageProfile.osDisk.osType)`,
  },
  {
    category: "Compute",
    name: "VMs by size",
    kql: `Resources
| where type =~ 'Microsoft.Compute/virtualMachines'
| summarize count() by size = tostring(properties.hardwareProfile.vmSize)
| order by count_ desc`,
  },
  {
    category: "Compute",
    name: "Unattached managed disks",
    kql: `Resources
| where type =~ 'Microsoft.Compute/disks'
| where isempty(managedBy)
| project name, resourceGroup, location, sizeGB = properties.diskSizeGB, sku = sku.name`,
  },
  {
    category: "Networking",
    name: "NSG rules exposing SSH/RDP to Internet",
    kql: `Resources
| where type =~ 'Microsoft.Network/networkSecurityGroups'
| mv-expand rule = properties.securityRules
| where rule.properties.direction == 'Inbound'
    and rule.properties.access == 'Allow'
    and rule.properties.sourceAddressPrefix in ('*','0.0.0.0/0','Internet')
    and (rule.properties.destinationPortRange in ('22','3389') or rule.properties.destinationPortRange == '*')
| project nsg = name, ruleName = tostring(rule.name), port = tostring(rule.properties.destinationPortRange), source = tostring(rule.properties.sourceAddressPrefix)`,
  },
  {
    category: "Networking",
    name: "Unassigned public IPs",
    kql: `Resources
| where type =~ 'Microsoft.Network/publicIPAddresses'
| where isnull(properties.ipConfiguration)
| project name, resourceGroup, location, sku = sku.name, allocation = properties.publicIPAllocationMethod`,
  },
  {
    category: "Storage",
    name: "Storage accounts allowing public blobs",
    kql: `Resources
| where type =~ 'Microsoft.Storage/storageAccounts'
| where properties.allowBlobPublicAccess == true
| project name, resourceGroup, location, sku = sku.name`,
  },
  {
    category: "Storage",
    name: "Storage accounts allowing HTTP",
    kql: `Resources
| where type =~ 'Microsoft.Storage/storageAccounts'
| where properties.supportsHttpsTrafficOnly == false
| project name, resourceGroup, location`,
  },
  {
    category: "Tagging",
    name: "Untagged resources",
    kql: `Resources
| where isempty(tags) or tags == dynamic({})
| summarize count() by type
| order by count_ desc`,
  },
  {
    category: "Tagging",
    name: "Resources by owner tag",
    kql: `Resources
| where isnotempty(tags.owner) or isnotempty(tags.Owner)
| extend owner = coalesce(tostring(tags.owner), tostring(tags.Owner))
| summarize count() by owner
| order by count_ desc`,
  },
  {
    category: "Cost signals",
    name: "Old snapshots (> 30 days)",
    kql: `Resources
| where type =~ 'Microsoft.Compute/snapshots'
| where todatetime(properties.timeCreated) < ago(30d)
| project name, resourceGroup, ageDays = datetime_diff('day', now(), todatetime(properties.timeCreated)), sizeGB = properties.diskSizeGB`,
  },
];

interface GraphResponse {
  totalRecords: number;
  count: number;
  data: Record<string, unknown>[];
}

export default function ResourceGraphPage() {
  const activeId = useSubscriptionStore((s) => s.activeId);
  const activeName = useSubscriptionStore((s) => s.activeName);

  const [selectedTemplate, setSelectedTemplate] = React.useState<string>("");
  const [query, setQuery] = React.useState<string>(TEMPLATES[0].kql);
  const [scope, setScope] = React.useState<"current" | "all">("current");

  const runMutation = useMutation<
    GraphResponse,
    Error,
    { query: string; subscriptions?: string[] }
  >({
    mutationFn: async (input) =>
      api.graph<Record<string, unknown>>(input.query, input.subscriptions, 500) as Promise<GraphResponse>,
  });

  const run = () => {
    if (!query.trim()) return;
    runMutation.mutate({
      query,
      subscriptions: scope === "current" && activeId ? [activeId] : undefined,
    });
  };

  const applyTemplate = (name: string) => {
    setSelectedTemplate(name);
    const t = TEMPLATES.find((x) => `${x.category} · ${x.name}` === name);
    if (t) setQuery(t.kql);
  };

  const data = runMutation.data;
  const rows = data?.data ?? [];
  const columnKeys = rows.length > 0 ? Object.keys(rows[0]) : [];

  const columns: DataColumn<Record<string, unknown>>[] = columnKeys.map((k) => ({
    key: k,
    header: k,
    accessor: (r) => {
      const v = r[k];
      if (v === null || v === undefined) return "";
      if (typeof v === "object") return JSON.stringify(v);
      return String(v);
    },
    cell: (r) => {
      const v = r[k];
      if (v === null || v === undefined)
        return <span className="text-muted-foreground">—</span>;
      if (typeof v === "object")
        return <span className="font-mono text-[10px]">{JSON.stringify(v)}</span>;
      return <span className="text-xs">{String(v)}</span>;
    },
  }));

  const grouped = React.useMemo(() => {
    const map = new Map<string, Template[]>();
    TEMPLATES.forEach((t) => {
      const arr = map.get(t.category) ?? [];
      arr.push(t);
      map.set(t.category, arr);
    });
    return map;
  }, []);

  if (!activeId) return <NoSubscriptionState />;

  return (
    <>
      <PageHeader
        icon={<Search className="h-5 w-5" />}
        title="Resource Graph Explorer"
        description={`Read-only KQL queries across Azure Resource Graph. Powered by ${scope === "all" ? "all accessible subscriptions" : activeName ?? "current subscription"}.`}
        actions={
          rows.length > 0 && (
            <ExportButtons
              filenameBase="resource_graph"
              title="Resource Graph Query Results"
              rows={rows}
              columns={columnKeys.map((k) => ({
                header: k,
                accessor: (r: Record<string, unknown>) => {
                  const v = r[k];
                  return typeof v === "object" && v !== null ? JSON.stringify(v) : String(v ?? "");
                },
              }))}
            />
          )
        }
      />

      <Alert>
        <Radio className="h-4 w-4" />
        <AlertTitle>Read-only query engine</AlertTitle>
        <AlertDescription>
          Azure Resource Graph is a query-only Kusto service. KQL has no INSERT
          / UPDATE / DELETE primitives — no query text can mutate Azure
          resources. Great for cross-subscription analysis.
        </AlertDescription>
      </Alert>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">KQL query</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-[280px] flex-1">
              <label className="mb-1 block text-xs font-medium">Query templates</label>
              <Select value={selectedTemplate} onValueChange={applyTemplate}>
                <SelectTrigger>
                  <SelectValue placeholder="Load a template…" />
                </SelectTrigger>
                <SelectContent>
                  {[...grouped.entries()].map(([cat, items]) => (
                    <React.Fragment key={cat}>
                      <div className="px-2 pb-1 pt-2 text-[10px] font-semibold uppercase text-muted-foreground">
                        {cat}
                      </div>
                      {items.map((t) => (
                        <SelectItem key={t.name} value={`${cat} · ${t.name}`}>
                          {t.name}
                        </SelectItem>
                      ))}
                    </React.Fragment>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium">Scope</label>
              <Select value={scope} onValueChange={(v: "current" | "all") => setScope(v)}>
                <SelectTrigger className="w-56">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="current">Current subscription</SelectItem>
                  <SelectItem value="all">All accessible subscriptions</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <textarea
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            spellCheck={false}
            rows={10}
            className="w-full rounded-md border bg-background p-3 font-mono text-xs shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            placeholder="Resources | project name, type | limit 100"
          />

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Badge variant="secondary" className="font-mono">KQL</Badge>
              Cross-subscription queries when scope = "All accessible"
            </div>
            <Button onClick={run} disabled={runMutation.isPending}>
              <PlayCircle className="h-4 w-4" />
              {runMutation.isPending ? "Running…" : "Run query"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {runMutation.isError && (
        <Alert variant="destructive">
          <AlertTitle>Query failed</AlertTitle>
          <AlertDescription className="break-all font-mono text-xs">
            {runMutation.error.message}
          </AlertDescription>
        </Alert>
      )}

      {data && (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
            <StatCard label="Records returned" value={data.count} />
            <StatCard label="Total matched" value={data.totalRecords} />
            <StatCard label="Columns" value={columnKeys.length} />
          </div>

          <DataTable
            rows={rows}
            columns={columns}
            isLoading={runMutation.isPending}
            searchPlaceholder="Filter results…"
            emptyMessage="Query returned zero rows."
            pageSize={50}
            getRowId={(_, i) => `graph-${i}`}
          />
        </>
      )}
    </>
  );
}
