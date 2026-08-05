"use client";

import { Cloud, Zap } from "lucide-react";
import { PageHeader } from "@/components/data/PageHeader";
import { DataTable, type DataColumn } from "@/components/data/DataTable";
import { NoSubscriptionState } from "@/components/data/NoSubscriptionState";
import { ExportButtons } from "@/components/data/ExportButtons";
import { useArmList } from "@/lib/hooks/use-arm";
import { useSubscriptionStore } from "@/lib/hooks/use-subscription";
import { ArmApi } from "@/lib/azure/arm";
import type { AppService } from "@/lib/azure/types";
import { resourceGroupFromId } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

interface AppRow {
  id: string;
  name: string;
  kind: string;
  isFunction: boolean;
  resourceGroup: string;
  region: string;
  state: string;
  hostname: string;
  httpsOnly: boolean;
  plan: string;
}

function toRow(app: AppService): AppRow {
  const kind = String(app.kind ?? "").toLowerCase();
  const planId = app.properties?.serverFarmId ?? "";
  const plan = planId ? planId.split("/").pop() ?? "" : "";
  return {
    id: app.id,
    name: app.name,
    kind: app.kind ?? "app",
    isFunction: kind.includes("functionapp"),
    resourceGroup: resourceGroupFromId(app.id),
    region: app.location,
    state: app.properties?.state ?? "-",
    hostname: app.properties?.defaultHostName ?? "-",
    httpsOnly: app.properties?.httpsOnly ?? false,
    plan,
  };
}

const columns: DataColumn<AppRow>[] = [
  {
    key: "name",
    header: "Name",
    accessor: (r) => r.name,
    cell: (r) => (
      <div className="flex items-center gap-2">
        {r.isFunction && <Zap className="h-3.5 w-3.5 text-warning" />}
        <span className="font-medium">{r.name}</span>
      </div>
    ),
  },
  {
    key: "kind",
    header: "Kind",
    accessor: (r) => r.kind,
    cell: (r) =>
      r.isFunction ? (
        <Badge variant="warning">Function</Badge>
      ) : (
        <Badge variant="secondary">Web App</Badge>
      ),
  },
  {
    key: "state",
    header: "State",
    accessor: (r) => r.state,
    cell: (r) => {
      const s = r.state.toLowerCase();
      if (s === "running") return <Badge variant="success">Running</Badge>;
      if (s === "stopped") return <Badge variant="secondary">Stopped</Badge>;
      return <Badge variant="outline">{r.state}</Badge>;
    },
  },
  { key: "rg", header: "Resource Group", accessor: (r) => r.resourceGroup },
  { key: "region", header: "Region", accessor: (r) => r.region },
  {
    key: "hostname",
    header: "Hostname",
    accessor: (r) => r.hostname,
    cell: (r) => (
      <a
        href={`https://${r.hostname}`}
        target="_blank"
        rel="noopener noreferrer"
        className="text-primary hover:underline"
      >
        {r.hostname}
      </a>
    ),
  },
  {
    key: "https",
    header: "HTTPS-only",
    accessor: (r) => (r.httpsOnly ? "yes" : "no"),
    cell: (r) =>
      r.httpsOnly ? (
        <Badge variant="success">Enforced</Badge>
      ) : (
        <Badge variant="destructive">HTTP allowed</Badge>
      ),
  },
  { key: "plan", header: "Plan", accessor: (r) => r.plan },
];

export default function AppServicesPage() {
  const activeId = useSubscriptionStore((s) => s.activeId);
  const activeName = useSubscriptionStore((s) => s.activeName);
  const { data, isLoading, isError, error } = useArmList<AppService>(
    "/providers/Microsoft.Web/sites",
    ArmApi.web,
  );

  const rows = (data?.value ?? []).map(toRow);

  if (!activeId) return <NoSubscriptionState />;

  return (
    <>
      <PageHeader
        icon={<Cloud className="h-5 w-5" />}
        title="App Services"
        description={`Web apps and Function apps in ${activeName ?? "the selected subscription"}.`}
        actions={
          <ExportButtons
            filenameBase="app_services"
            title="App Services Report"
            subtitle={activeName ?? undefined}
            rows={rows}
            columns={[
              { header: "Name", accessor: (r) => r.name },
              { header: "Kind", accessor: (r) => r.kind },
              { header: "Function App", accessor: (r) => (r.isFunction ? "yes" : "no") },
              { header: "State", accessor: (r) => r.state },
              { header: "Resource Group", accessor: (r) => r.resourceGroup },
              { header: "Region", accessor: (r) => r.region },
              { header: "Default Hostname", accessor: (r) => r.hostname },
              { header: "HTTPS Only", accessor: (r) => (r.httpsOnly ? "yes" : "no") },
              { header: "App Service Plan", accessor: (r) => r.plan },
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
        searchPlaceholder="Filter by name, kind, or hostname…"
        emptyMessage="No App Services found in this subscription."
        getRowId={(r) => r.id}
      />
    </>
  );
}
