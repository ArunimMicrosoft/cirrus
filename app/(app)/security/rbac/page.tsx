"use client";

import { Users, ShieldAlert } from "lucide-react";
import { PageHeader } from "@/components/data/PageHeader";
import { StatCard } from "@/components/data/StatCard";
import { DataTable, type DataColumn } from "@/components/data/DataTable";
import { NoSubscriptionState } from "@/components/data/NoSubscriptionState";
import { ExportButtons } from "@/components/data/ExportButtons";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useArmList } from "@/lib/hooks/use-arm";
import { useSubscriptionStore } from "@/lib/hooks/use-subscription";
import { ArmApi } from "@/lib/azure/arm";

type Priv = "critical" | "high" | "normal";

interface RoleAssignment {
  id: string;
  name: string;
  properties?: {
    roleDefinitionId?: string;
    principalId?: string;
    principalType?: string;
    scope?: string;
  };
}
interface RoleDefinition {
  id: string;
  name: string;
  properties?: { roleName?: string; type?: string };
}

interface RbacRow {
  id: string;
  role: string;
  principalId: string;
  principalType: string;
  scope: string;
  scopeLevel: string;
  privilege: Priv;
}

const HIGH_ROLES = new Set(["Owner", "User Access Administrator", "Contributor"]);

function scopeLevel(scope: string): string {
  if (!scope || scope === "/") return "Root / Tenant";
  const rg = /\/resourceGroups\/([^/]+)/i.exec(scope);
  const provider = /\/providers\/[^/]+\/[^/]+\/([^/]+)$/i.exec(scope);
  if (provider) return `Resource: ${provider[1]}`;
  if (rg && !/\/providers\//i.test(scope)) return `RG: ${rg[1]}`;
  if (/^\/subscriptions\/[^/]+$/i.test(scope)) return "Subscription";
  if (/^\/providers\/Microsoft\.Management\/managementGroups\//i.test(scope)) return "Management group";
  return "Scoped";
}

const PRIV_BADGE: Record<Priv, "destructive" | "warning" | "secondary"> = {
  critical: "destructive",
  high: "warning",
  normal: "secondary",
};

const columns: DataColumn<RbacRow>[] = [
  {
    key: "role",
    header: "Role",
    accessor: (r) => r.role,
    cell: (r) => <span className="font-medium">{r.role}</span>,
  },
  { key: "type", header: "Principal type", accessor: (r) => r.principalType },
  {
    key: "principal",
    header: "Principal ID",
    accessor: (r) => r.principalId,
    cell: (r) => <span className="font-mono text-xs">{r.principalId.slice(0, 13)}…</span>,
  },
  { key: "scopeLevel", header: "Scope", accessor: (r) => r.scopeLevel },
  {
    key: "priv",
    header: "Privilege",
    accessor: (r) => r.privilege,
    cell: (r) =>
      r.privilege === "normal" ? (
        <Badge variant="secondary">standard</Badge>
      ) : (
        <Badge variant={PRIV_BADGE[r.privilege]}>
          {r.privilege === "critical" ? "high privilege" : "elevated"}
        </Badge>
      ),
  },
];

export default function RbacPage() {
  const activeId = useSubscriptionStore((s) => s.activeId);
  const activeName = useSubscriptionStore((s) => s.activeName);

  const assignments = useArmList<RoleAssignment>(
    "/providers/Microsoft.Authorization/roleAssignments",
    ArmApi.authorization,
  );
  const definitions = useArmList<RoleDefinition>(
    "/providers/Microsoft.Authorization/roleDefinitions",
    ArmApi.authorization,
  );

  const roleName = new Map<string, string>();
  for (const def of definitions.data?.value ?? []) {
    if (def.name && def.properties?.roleName) roleName.set(def.name.toLowerCase(), def.properties.roleName);
  }

  const rows: RbacRow[] = (assignments.data?.value ?? []).map((a) => {
    const guid = (a.properties?.roleDefinitionId ?? "").split("/").pop()?.toLowerCase() ?? "";
    const role = roleName.get(guid) ?? "Custom / unknown role";
    const scope = a.properties?.scope ?? "";
    const level = scopeLevel(scope);
    let privilege: Priv = "normal";
    if (role === "Owner" || role === "User Access Administrator") privilege = "critical";
    else if (role === "Contributor") privilege = "high";
    return {
      id: a.id,
      role,
      principalId: a.properties?.principalId ?? "—",
      principalType: a.properties?.principalType ?? "Unknown",
      scope,
      scopeLevel: level,
      privilege,
    };
  });
  rows.sort((a, b) => {
    const rank = { critical: 0, high: 1, normal: 2 };
    return rank[a.privilege] - rank[b.privilege];
  });

  const owners = rows.filter((r) => r.role === "Owner").length;
  const contributors = rows.filter((r) => r.role === "Contributor").length;
  const highAtSub = rows.filter((r) => HIGH_ROLES.has(r.role) && r.scopeLevel === "Subscription").length;
  const loading = assignments.isLoading || definitions.isLoading;

  if (!activeId) return <NoSubscriptionState />;

  return (
    <>
      <PageHeader
        icon={<Users className="h-5 w-5" />}
        title="RBAC & Over-Privilege Review"
        description="Every role assignment in the subscription, with standing Owner/Contributor access flagged. Answers 'who can touch this environment'."
        actions={
          <ExportButtons
            filenameBase="rbac-review"
            title="RBAC & Over-Privilege Review"
            subtitle={activeName ?? undefined}
            rows={rows}
            columns={[
              { header: "Role", accessor: (r) => r.role },
              { header: "Principal Type", accessor: (r) => r.principalType },
              { header: "Principal ID", accessor: (r) => r.principalId },
              { header: "Scope", accessor: (r) => r.scope },
              { header: "Scope Level", accessor: (r) => r.scopeLevel },
              { header: "Privilege", accessor: (r) => r.privilege },
            ]}
          />
        }
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Role assignments" value={rows.length} loading={loading} />
        <StatCard label="Owners" value={owners} icon={<ShieldAlert className="h-4 w-4" />} loading={loading} />
        <StatCard label="Contributors" value={contributors} loading={loading} />
        <StatCard label="High-priv at sub scope" value={highAtSub} loading={loading} />
      </div>

      <Alert>
        <AlertTitle>Reads role assignments only (Reader-level)</AlertTitle>
        <AlertDescription>
          Principal <em>display names</em>, guest-account and stale/expired-credential
          detection require Microsoft Graph access beyond the Reader role, so principals
          are shown by object ID. Role names and scopes are resolved from Azure RBAC.
        </AlertDescription>
      </Alert>

      <DataTable
        rows={rows}
        columns={columns}
        isLoading={loading}
        isError={assignments.isError}
        error={assignments.error}
        searchPlaceholder="Filter by role, scope, principal…"
        emptyMessage="No role assignments returned for this scope."
        getRowId={(r) => r.id}
      />
    </>
  );
}
