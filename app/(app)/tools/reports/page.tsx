"use client";

/* eslint-disable @typescript-eslint/no-explicit-any */

import { useState } from "react";
import { FileBarChart2, ShieldCheck, Loader2 } from "lucide-react";
import { PageHeader } from "@/components/data/PageHeader";
import { NoSubscriptionState } from "@/components/data/NoSubscriptionState";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useArmList } from "@/lib/hooks/use-arm";
import { useSubscriptionStore } from "@/lib/hooks/use-subscription";
import { ArmApi } from "@/lib/azure/arm";
import { resourceGroupFromId } from "@/lib/utils";
import { exportPdfReport, type PdfReportSection } from "@/lib/pdf";

const CRIT: Record<string, string> = { "22": "SSH", "3389": "RDP", "23": "Telnet", "5985": "WinRM", "5986": "WinRM" };
const HIGH: Record<string, string> = { "1433": "SQL", "3306": "MySQL", "5432": "PostgreSQL", "6379": "Redis", "445": "SMB", "21": "FTP" };
const OPEN = new Set(["*", "0.0.0.0/0", "internet", "any"]);

export default function ReportsPage() {
  const activeId = useSubscriptionStore((s) => s.activeId);
  const activeName = useSubscriptionStore((s) => s.activeName);
  const [preparedFor, setPreparedFor] = useState("");
  const [busy, setBusy] = useState<"security" | "full" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const rgs = useArmList<any>("/resourcegroups", ArmApi.resourceGroups);
  const vms = useArmList<any>("/providers/Microsoft.Compute/virtualMachines", ArmApi.computeVms);
  const storage = useArmList<any>("/providers/Microsoft.Storage/storageAccounts", ArmApi.storage);
  const sql = useArmList<any>("/providers/Microsoft.Sql/servers", ArmApi.sql);
  const nsgs = useArmList<any>("/providers/Microsoft.Network/networkSecurityGroups", ArmApi.network);
  const pips = useArmList<any>("/providers/Microsoft.Network/publicIPAddresses", ArmApi.network);
  const certs = useArmList<any>("/providers/Microsoft.Web/certificates", ArmApi.web);
  const assignments = useArmList<any>("/providers/Microsoft.Authorization/roleAssignments", ArmApi.authorization);
  const roleDefs = useArmList<any>("/providers/Microsoft.Authorization/roleDefinitions", ArmApi.authorization);

  const loading =
    rgs.isLoading || vms.isLoading || storage.isLoading || sql.isLoading || nsgs.isLoading || pips.isLoading;

  function exposureRows() {
    const rows: Record<string, string>[] = [];
    for (const nsg of nsgs.data?.value ?? []) {
      for (const rule of nsg.properties?.securityRules ?? []) {
        const p = rule.properties ?? {};
        if (p.direction !== "Inbound" || p.access !== "Allow") continue;
        const srcs = [p.sourceAddressPrefix, ...(p.sourceAddressPrefixes ?? [])].filter(Boolean).map((s: string) => s.toLowerCase());
        if (!srcs.some((s: string) => OPEN.has(s))) continue;
        const ports = [p.destinationPortRange, ...(p.destinationPortRanges ?? [])].filter(Boolean) as string[];
        let sev = "ordinary";
        const names: string[] = [];
        for (const pt of ports) {
          if (pt === "*") { sev = "critical"; names.push("ALL"); }
          else if (CRIT[pt]) { sev = "critical"; names.push(CRIT[pt]); }
          else if (HIGH[pt]) { if (sev !== "critical") sev = "sensitive"; names.push(HIGH[pt]); }
        }
        rows.push({
          nsg: nsg.name,
          rule: rule.name,
          source: p.sourceAddressPrefix || "*",
          ports: ports.join(", ") || "*",
          service: names.length ? [...new Set(names)].join(", ") : "custom",
          exposure: sev,
        });
      }
    }
    return rows.sort((a, b) => (a.exposure === "critical" ? -1 : 1));
  }

  function rbacRows() {
    const nameByGuid = new Map<string, string>();
    for (const d of roleDefs.data?.value ?? []) {
      if (d.name && d.properties?.roleName) nameByGuid.set(String(d.name).toLowerCase(), d.properties.roleName);
    }
    return (assignments.data?.value ?? [])
      .map((a: any) => {
        const guid = (a.properties?.roleDefinitionId ?? "").split("/").pop()?.toLowerCase() ?? "";
        return {
          role: nameByGuid.get(guid) ?? "Custom role",
          type: a.properties?.principalType ?? "Unknown",
          principal: String(a.properties?.principalId ?? "").slice(0, 18),
        };
      })
      .filter((r: any) => r.role === "Owner" || r.role === "Contributor" || r.role === "User Access Administrator");
  }

  function certRows() {
    const now = Date.now();
    return (certs.data?.value ?? [])
      .map((c: any) => {
        const exp = c.properties?.expirationDate ? new Date(c.properties.expirationDate).getTime() : NaN;
        const days = Number.isFinite(exp) ? Math.floor((exp - now) / 86_400_000) : Infinity;
        return { name: c.name, subject: c.properties?.subjectName ?? "—", expiry: c.properties?.expirationDate?.slice(0, 10) ?? "—", days };
      })
      .filter((c: any) => c.days <= 90)
      .sort((a: any, b: any) => a.days - b.days)
      .map((c: any) => ({ name: c.name, subject: c.subject, expiry: c.expiry, daysLeft: c.days < 0 ? "expired" : `${c.days}d` }));
  }

  const generate = async (type: "security" | "full") => {
    setBusy(type);
    setError(null);
    try {
      const exposures = exposureRows();
      const criticalExp = exposures.filter((r) => r.exposure === "critical").length;
      const publicSql = (sql.data?.value ?? []).filter((s: any) => (s.properties?.publicNetworkAccess ?? "Enabled") === "Enabled");
      const publicStorage = (storage.data?.value ?? []).filter(
        (s: any) => s.properties?.allowBlobPublicAccess || s.properties?.supportsHttpsTrafficOnly === false,
      );
      const publicIps = (pips.data?.value ?? []).filter((p: any) => p.properties?.ipAddress);
      const rbac = rbacRows();
      const owners = rbac.filter((r: any) => r.role === "Owner").length;
      const expiringCerts = certRows();

      const sections: PdfReportSection[] = [];

      sections.push({
        heading: "Executive summary",
        blurb:
          "A read-only snapshot of this subscription's security posture and footprint, generated live from Azure Resource Manager. No changes were made to any resource.",
        kpis: [
          { label: "Resource groups", value: String((rgs.data?.value ?? []).length) },
          { label: "Virtual machines", value: String((vms.data?.value ?? []).length) },
          { label: "Public IPs", value: String(publicIps.length) },
          { label: "Critical exposures", value: String(criticalExp) },
          { label: "Public PaaS", value: String(publicSql.length + publicStorage.length) },
          { label: "Standing Owners", value: String(owners) },
          { label: "Certs ≤ 90d", value: String(expiringCerts.length) },
          { label: "Internet-open rules", value: String(exposures.length) },
        ],
      });

      sections.push({
        heading: "Internet attack surface",
        blurb:
          criticalExp > 0
            ? `${criticalExp} critical path(s) (remote-admin or wide-open) are reachable from any source. These are the first routes to close.`
            : "No remote-admin or wide-open rules are reachable from any source.",
        columns: [
          { header: "NSG", accessor: (r) => r.nsg, weight: 1.4 },
          { header: "Rule", accessor: (r) => r.rule, weight: 1.6 },
          { header: "Source", accessor: (r) => r.source, weight: 1.2 },
          { header: "Ports", accessor: (r) => r.ports, weight: 1 },
          { header: "Service", accessor: (r) => r.service, weight: 1 },
          { header: "Exposure", accessor: (r) => r.exposure, weight: 0.9 },
        ],
        rows: exposures,
        maxRows: 25,
      });

      if (publicSql.length + publicStorage.length > 0) {
        sections.push({
          heading: "Publicly reachable PaaS",
          columns: [
            { header: "Resource", accessor: (r) => r.name, weight: 2 },
            { header: "Type", accessor: (r) => r.type, weight: 1 },
            { header: "Finding", accessor: (r) => r.finding, weight: 2 },
          ],
          rows: [
            ...publicSql.map((s: any) => ({ name: s.name, type: "SQL Server", finding: "Public network access enabled" })),
            ...publicStorage.map((s: any) => ({
              name: s.name,
              type: "Storage",
              finding: s.properties?.allowBlobPublicAccess ? "Public blob access allowed" : "Insecure (HTTP) transfer allowed",
            })),
          ],
          maxRows: 20,
        });
      }

      sections.push({
        heading: "Privileged access (RBAC)",
        blurb:
          "Standing Owner / Contributor / User Access Administrator assignments. Principal display names require Microsoft Graph beyond Reader, so principals are shown by object ID.",
        columns: [
          { header: "Role", accessor: (r) => r.role, weight: 1.3 },
          { header: "Principal type", accessor: (r) => r.type, weight: 1 },
          { header: "Principal ID", accessor: (r) => r.principal, weight: 2 },
        ],
        rows: rbac,
        maxRows: 20,
      });

      if (expiringCerts.length > 0) {
        sections.push({
          heading: "Certificates expiring within 90 days",
          columns: [
            { header: "Certificate", accessor: (r) => r.name, weight: 1.5 },
            { header: "Subject", accessor: (r) => r.subject, weight: 2 },
            { header: "Expires", accessor: (r) => r.expiry, weight: 1 },
            { header: "Status", accessor: (r) => r.daysLeft, weight: 0.8 },
          ],
          rows: expiringCerts,
          maxRows: 20,
        });
      }

      if (type === "full") {
        sections.push({
          heading: "Inventory footprint",
          kpis: [
            { label: "Resource groups", value: String((rgs.data?.value ?? []).length) },
            { label: "Virtual machines", value: String((vms.data?.value ?? []).length) },
            { label: "Storage accounts", value: String((storage.data?.value ?? []).length) },
            { label: "SQL servers", value: String((sql.data?.value ?? []).length) },
            { label: "NSGs", value: String((nsgs.data?.value ?? []).length) },
            { label: "Public IPs", value: String(publicIps.length) },
          ],
          columns: [
            { header: "Virtual machine", accessor: (r) => r.name, weight: 2 },
            { header: "Resource group", accessor: (r) => r.rg, weight: 1.5 },
            { header: "Size", accessor: (r) => r.size, weight: 1.2 },
          ],
          rows: (vms.data?.value ?? []).map((v: any) => ({
            name: v.name,
            rg: resourceGroupFromId(v.id),
            size: v.properties?.hardwareProfile?.vmSize ?? "—",
          })),
          maxRows: 25,
        });
      }

      await exportPdfReport(sections, {
        title: type === "security" ? "Azure Security Posture Report" : "Azure Estate Report",
        preparedFor: preparedFor.trim() || undefined,
        subscription: activeName ?? undefined,
        filename: type === "security" ? "meridian-security-report" : "meridian-estate-report",
      });
    } catch (e) {
      console.error("Report generation failed", e);
      setError(
        e instanceof Error
          ? `Report generation failed: ${e.message}`
          : "Report generation failed. Please try again.",
      );
    } finally {
      setBusy(null);
    }
  };

  if (!activeId) return <NoSubscriptionState />;

  return (
    <>
      <PageHeader
        icon={<FileBarChart2 className="h-5 w-5" />}
        title="Executive Reports"
        description="Generate a branded, read-only PDF — an executive summary an MSP or CISO can hand over. Compiled live from this subscription."
      />

      <Card className="max-w-2xl">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Build a report</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="preparedFor">Prepared for (optional)</Label>
            <Input
              id="preparedFor"
              placeholder="e.g. Contoso Ltd — Q3 security review"
              value={preparedFor}
              onChange={(e) => setPreparedFor(e.target.value)}
            />
            <p className="text-[11px] text-muted-foreground">
              Appears on the report cover alongside the {activeName ? `"${activeName}"` : "subscription"} name and date.
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <Button onClick={() => generate("security")} disabled={loading || busy !== null}>
              {busy === "security" ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
              Security posture report
            </Button>
            <Button variant="outline" onClick={() => generate("full")} disabled={loading || busy !== null}>
              {busy === "full" ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileBarChart2 className="h-4 w-4" />}
              Full estate report
            </Button>
          </div>
          {loading && <p className="text-[12px] text-muted-foreground">Gathering data from Azure…</p>}
          {error && (
            <Alert variant="destructive">
              <AlertTitle>Couldn&apos;t build the report</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      <Alert>
        <AlertTitle>What&apos;s in the report</AlertTitle>
        <AlertDescription>
          Executive summary (KPIs), internet attack surface, publicly reachable PaaS, privileged
          RBAC assignments, and expiring certificates — plus an inventory footprint in the full
          report. Every page carries the branding, a READ-ONLY watermark, and the generation
          timestamp. Rendered entirely in your browser.
        </AlertDescription>
      </Alert>
    </>
  );
}
