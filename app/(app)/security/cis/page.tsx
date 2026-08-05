"use client";

import { ListChecks, ShieldCheck, ShieldAlert } from "lucide-react";
import { PageHeader } from "@/components/data/PageHeader";
import { DataTable, type DataColumn } from "@/components/data/DataTable";
import { NoSubscriptionState } from "@/components/data/NoSubscriptionState";
import { ExportButtons } from "@/components/data/ExportButtons";
import { StatCard } from "@/components/data/StatCard";
import { useArmList } from "@/lib/hooks/use-arm";
import { useSubscriptionStore } from "@/lib/hooks/use-subscription";
import { ArmApi } from "@/lib/azure/arm";
import { Badge } from "@/components/ui/badge";
import type {
  AppService,
  KeyVault,
  NetworkSecurityGroup,
  StorageAccount,
  VirtualMachine,
} from "@/lib/azure/types";
import { classifyHardening } from "@/lib/azure/hardening";

interface Check {
  id: string;
  section: string;
  description: string;
  status: "PASS" | "FAIL" | "REVIEW" | "N/A";
  severity: "Critical" | "High" | "Medium" | "Low" | "-";
  affected: number;
  detail: string;
}

const CRIT_PORTS_RDP = new Set(["3389", "*"]);
const CRIT_PORTS_SSH = new Set(["22", "*"]);
const CRIT_PORTS_DB = new Set(["1433", "3306", "5432", "*"]);
const OPEN_SOURCES = new Set(["*", "0.0.0.0/0", "Internet"]);

type NsgRule = NonNullable<
  NonNullable<NetworkSecurityGroup["properties"]>["securityRules"]
>[number];

function isInboundInternetAllow(rule: NsgRule) {
  const p = rule.properties;
  return (
    p.direction === "Inbound" &&
    p.access === "Allow" &&
    OPEN_SOURCES.has(p.sourceAddressPrefix ?? "")
  );
}

export default function CisAuditPage() {
  const activeId = useSubscriptionStore((s) => s.activeId);
  const activeName = useSubscriptionStore((s) => s.activeName);

  const nsgs = useArmList<NetworkSecurityGroup>(
    "/providers/Microsoft.Network/networkSecurityGroups",
    ArmApi.network,
  );
  const storage = useArmList<StorageAccount>(
    "/providers/Microsoft.Storage/storageAccounts",
    ArmApi.storage,
  );
  const apps = useArmList<AppService>(
    "/providers/Microsoft.Web/sites",
    ArmApi.web,
  );
  const vms = useArmList<VirtualMachine>(
    "/providers/Microsoft.Compute/virtualMachines",
    ArmApi.computeVms,
  );
  const kvs = useArmList<KeyVault>(
    "/providers/Microsoft.KeyVault/vaults",
    ArmApi.keyvault,
  );

  const nsgList = nsgs.data?.value ?? [];
  const storageList = storage.data?.value ?? [];
  const appList = apps.data?.value ?? [];
  const vmList = vms.data?.value ?? [];
  const kvList = kvs.data?.value ?? [];

  const rdpOpen = nsgList
    .flatMap((n) => (n.properties?.securityRules ?? []).map((r) => ({ n, r })))
    .filter(
      ({ r }) =>
        isInboundInternetAllow(r) &&
        CRIT_PORTS_RDP.has(r.properties.destinationPortRange ?? ""),
    )
    .map(({ n, r }) => `${n.name}/${r.name}`);

  const sshOpen = nsgList
    .flatMap((n) => (n.properties?.securityRules ?? []).map((r) => ({ n, r })))
    .filter(
      ({ r }) =>
        isInboundInternetAllow(r) &&
        CRIT_PORTS_SSH.has(r.properties.destinationPortRange ?? ""),
    )
    .map(({ n, r }) => `${n.name}/${r.name}`);

  const dbOpen = nsgList
    .flatMap((n) => (n.properties?.securityRules ?? []).map((r) => ({ n, r })))
    .filter(
      ({ r }) =>
        isInboundInternetAllow(r) &&
        CRIT_PORTS_DB.has(r.properties.destinationPortRange ?? ""),
    )
    .map(({ n, r }) => `${n.name}/${r.name}`);

  const httpStorage = storageList.filter(
    (s) => s.properties?.supportsHttpsTrafficOnly === false,
  );
  const publicBlob = storageList.filter(
    (s) => s.properties?.allowBlobPublicAccess === true,
  );
  const openStorageNet = storageList.filter(
    (s) =>
      (s.properties?.networkAcls?.defaultAction ?? "Allow").toLowerCase() === "allow",
  );
  const httpApps = appList.filter((a) => a.properties?.httpsOnly === false);

  const hardened = vmList.filter((vm) => {
    const img = vm.properties?.storageProfile?.imageReference;
    const cls = classifyHardening(img?.publisher, img?.offer, img?.sku);
    return cls.level === "cis" || cls.level === "stig" || cls.level === "azure-baseline";
  });

  const kvNoSoftDelete = kvList.filter((k) => k.properties?.enableSoftDelete === false);
  const kvNoPurge = kvList.filter((k) => k.properties?.enablePurgeProtection !== true);
  const kvOpenNet = kvList.filter(
    (k) =>
      (k.properties?.networkAcls?.defaultAction ?? "Allow").toLowerCase() === "allow",
  );

  const checks: Check[] = [
    {
      id: "6.1",
      section: "Networking",
      description: "Ensure RDP (3389) access is restricted from the Internet",
      status: rdpOpen.length > 0 ? "FAIL" : "PASS",
      severity: rdpOpen.length > 0 ? "Critical" : "-",
      affected: rdpOpen.length,
      detail: rdpOpen.length > 0 ? rdpOpen.slice(0, 5).join(", ") : "No RDP open to Internet",
    },
    {
      id: "6.2",
      section: "Networking",
      description: "Ensure SSH (22) access is restricted from the Internet",
      status: sshOpen.length > 0 ? "FAIL" : "PASS",
      severity: sshOpen.length > 0 ? "Critical" : "-",
      affected: sshOpen.length,
      detail: sshOpen.length > 0 ? sshOpen.slice(0, 5).join(", ") : "No SSH open to Internet",
    },
    {
      id: "6.3",
      section: "Networking",
      description: "Ensure DB ports (1433/3306/5432) restricted from the Internet",
      status: dbOpen.length > 0 ? "FAIL" : "PASS",
      severity: dbOpen.length > 0 ? "High" : "-",
      affected: dbOpen.length,
      detail:
        dbOpen.length > 0 ? dbOpen.slice(0, 5).join(", ") : "No DB ports open to Internet",
    },
    {
      id: "3.1",
      section: "Storage",
      description: "Ensure secure transfer (HTTPS-only) is enabled",
      status: httpStorage.length > 0 ? "FAIL" : "PASS",
      severity: httpStorage.length > 0 ? "High" : "-",
      affected: httpStorage.length,
      detail:
        httpStorage.length > 0
          ? httpStorage.map((s) => s.name).slice(0, 5).join(", ")
          : "All storage accounts enforce HTTPS",
    },
    {
      id: "3.7",
      section: "Storage",
      description: "Ensure public blob access is disabled",
      status: publicBlob.length > 0 ? "FAIL" : "PASS",
      severity: publicBlob.length > 0 ? "High" : "-",
      affected: publicBlob.length,
      detail:
        publicBlob.length > 0
          ? publicBlob.map((s) => s.name).slice(0, 5).join(", ")
          : "No storage account allows public blobs",
    },
    {
      id: "3.2",
      section: "Storage",
      description: "Ensure default network action is Deny",
      status: openStorageNet.length > 0 ? "FAIL" : "PASS",
      severity: openStorageNet.length > 0 ? "Medium" : "-",
      affected: openStorageNet.length,
      detail:
        openStorageNet.length > 0
          ? openStorageNet.map((s) => s.name).slice(0, 5).join(", ")
          : "All storage accounts deny by default",
    },
    {
      id: "9.2",
      section: "App Service",
      description: "Ensure App Service enforces HTTPS-only",
      status: httpApps.length > 0 ? "FAIL" : "PASS",
      severity: httpApps.length > 0 ? "High" : "-",
      affected: httpApps.length,
      detail:
        httpApps.length > 0
          ? httpApps.map((a) => a.name).slice(0, 5).join(", ")
          : "All App Services enforce HTTPS",
    },
    {
      id: "7.x",
      section: "VMs",
      description: "Ensure VMs use CIS/STIG hardened images",
      status:
        vmList.length === 0
          ? "N/A"
          : hardened.length === vmList.length
          ? "PASS"
          : "FAIL",
      severity: hardened.length < vmList.length && vmList.length > 0 ? "Medium" : "-",
      affected: vmList.length - hardened.length,
      detail: `${hardened.length}/${vmList.length} use hardened images`,
    },
    {
      id: "8.1",
      section: "Key Vault",
      description: "Ensure soft-delete is enabled on all Key Vaults",
      status: kvNoSoftDelete.length > 0 ? "FAIL" : "PASS",
      severity: kvNoSoftDelete.length > 0 ? "High" : "-",
      affected: kvNoSoftDelete.length,
      detail:
        kvNoSoftDelete.length > 0
          ? kvNoSoftDelete.map((k) => k.name).slice(0, 5).join(", ")
          : "All Key Vaults have soft-delete enabled",
    },
    {
      id: "8.2",
      section: "Key Vault",
      description: "Ensure purge protection is enabled on all Key Vaults",
      status: kvNoPurge.length > 0 ? "FAIL" : "PASS",
      severity: kvNoPurge.length > 0 ? "High" : "-",
      affected: kvNoPurge.length,
      detail:
        kvNoPurge.length > 0
          ? kvNoPurge.map((k) => k.name).slice(0, 5).join(", ")
          : "All Key Vaults have purge protection",
    },
    {
      id: "8.3",
      section: "Key Vault",
      description: "Ensure Key Vault network default action is Deny",
      status: kvOpenNet.length > 0 ? "FAIL" : "PASS",
      severity: kvOpenNet.length > 0 ? "Medium" : "-",
      affected: kvOpenNet.length,
      detail:
        kvOpenNet.length > 0
          ? kvOpenNet.map((k) => k.name).slice(0, 5).join(", ")
          : "All Key Vaults deny by default",
    },
    {
      id: "5.1",
      section: "Monitoring",
      description: "Ensure Activity Log alerts exist for critical operations",
      status: "REVIEW",
      severity: "Medium",
      affected: 0,
      detail:
        "Verify manually in Monitor Alerts — this requires cross-referencing with alert rule scope.",
    },
  ];

  const total = checks.length;
  const passed = checks.filter((c) => c.status === "PASS").length;
  const failed = checks.filter((c) => c.status === "FAIL").length;
  const review = checks.filter((c) => c.status === "REVIEW").length;
  const score = total > 0 ? Math.round((passed / total) * 100) : 0;

  const columns: DataColumn<Check>[] = [
    {
      key: "id",
      header: "CIS ID",
      accessor: (r) => r.id,
      cell: (r) => <span className="font-mono text-xs font-semibold">{r.id}</span>,
    },
    { key: "section", header: "Section", accessor: (r) => r.section },
    {
      key: "desc",
      header: "Control",
      accessor: (r) => r.description,
      cell: (r) => <span className="text-sm">{r.description}</span>,
    },
    {
      key: "status",
      header: "Status",
      accessor: (r) => r.status,
      cell: (r) => {
        if (r.status === "PASS")
          return (
            <Badge variant="success">
              <ShieldCheck className="mr-1 h-3 w-3" />
              PASS
            </Badge>
          );
        if (r.status === "FAIL")
          return (
            <Badge variant="destructive">
              <ShieldAlert className="mr-1 h-3 w-3" />
              FAIL
            </Badge>
          );
        if (r.status === "REVIEW") return <Badge variant="warning">REVIEW</Badge>;
        return <Badge variant="outline">N/A</Badge>;
      },
    },
    {
      key: "sev",
      header: "Severity",
      accessor: (r) => r.severity,
      cell: (r) => {
        if (r.severity === "-") return <span className="text-muted-foreground">—</span>;
        const tone =
          r.severity === "Critical"
            ? "destructive"
            : r.severity === "High"
            ? "destructive"
            : r.severity === "Medium"
            ? "warning"
            : "secondary";
        return <Badge variant={tone}>{r.severity}</Badge>;
      },
    },
    {
      key: "affected",
      header: "Affected",
      accessor: (r) => r.affected,
      cell: (r) => <span className="tabular-nums">{r.affected || "-"}</span>,
    },
    {
      key: "detail",
      header: "Detail",
      accessor: (r) => r.detail,
      cell: (r) => (
        <span className="line-clamp-2 text-xs text-muted-foreground" title={r.detail}>
          {r.detail}
        </span>
      ),
    },
  ];

  const loading = nsgs.isLoading || storage.isLoading || apps.isLoading || vms.isLoading || kvs.isLoading;

  if (!activeId) return <NoSubscriptionState />;

  return (
    <>
      <PageHeader
        icon={<ListChecks className="h-5 w-5" />}
        title="CIS Azure Benchmark Audit"
        description={`Automated checks mapped to CIS Microsoft Azure Foundations Benchmark controls.`}
        actions={
          <ExportButtons
            filenameBase="cis_audit"
            title="CIS Azure Benchmark Audit"
            subtitle={activeName ?? undefined}
            rows={checks}
            columns={[
              { header: "CIS ID", accessor: (r) => r.id },
              { header: "Section", accessor: (r) => r.section },
              { header: "Control", accessor: (r) => r.description },
              { header: "Status", accessor: (r) => r.status },
              { header: "Severity", accessor: (r) => r.severity },
              { header: "Affected", accessor: (r) => r.affected },
              { header: "Detail", accessor: (r) => r.detail },
            ]}
          />
        }
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard
          label="Compliance score"
          value={`${score}%`}
          delta={`${passed}/${total} passed`}
          deltaTone={score >= 80 ? "positive" : score >= 60 ? "default" : "negative"}
          icon={<ShieldCheck className="h-4 w-4" />}
          loading={loading}
        />
        <StatCard label="Passed" value={passed} loading={loading} />
        <StatCard label="Failed" value={failed} deltaTone={failed > 0 ? "negative" : "positive"} loading={loading} />
        <StatCard label="Review" value={review} loading={loading} />
      </div>

      <DataTable
        rows={checks}
        columns={columns}
        isLoading={loading}
        searchPlaceholder="Filter by control, section, or status…"
        emptyMessage="No checks to display."
        getRowId={(r) => r.id}
      />
    </>
  );
}
