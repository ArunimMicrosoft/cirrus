"use client";

import { CalendarClock, ShieldAlert } from "lucide-react";
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
import { resourceGroupFromId } from "@/lib/utils";

interface WebCert {
  id: string;
  name: string;
  location?: string;
  properties?: {
    expirationDate?: string;
    issueDate?: string;
    subjectName?: string;
    thumbprint?: string;
    hostNames?: string[];
    issuer?: string;
  };
}

interface CertRow {
  id: string;
  name: string;
  resourceGroup: string;
  subject: string;
  hosts: string;
  expiry: string;
  daysLeft: number;
}

function daysUntil(iso?: string): number {
  if (!iso) return Number.POSITIVE_INFINITY;
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return Number.POSITIVE_INFINITY;
  return Math.floor((t - Date.now()) / 86_400_000);
}

function bucketBadge(days: number) {
  if (days < 0) return <Badge variant="destructive">expired</Badge>;
  if (days <= 30) return <Badge variant="destructive">{days}d left</Badge>;
  if (days <= 90) return <Badge variant="warning">{days}d left</Badge>;
  return <Badge variant="success">{Number.isFinite(days) ? `${days}d left` : "—"}</Badge>;
}

const columns: DataColumn<CertRow>[] = [
  { key: "name", header: "Certificate", accessor: (r) => r.name, cell: (r) => <span className="font-medium">{r.name}</span> },
  { key: "subject", header: "Subject", accessor: (r) => r.subject },
  { key: "hosts", header: "Host names", accessor: (r) => r.hosts },
  { key: "rg", header: "Resource Group", accessor: (r) => r.resourceGroup },
  { key: "expiry", header: "Expires", accessor: (r) => r.expiry },
  {
    key: "days",
    header: "Status",
    accessor: (r) => r.daysLeft,
    cell: (r) => bucketBadge(r.daysLeft),
  },
];

export default function CertificatesPage() {
  const activeId = useSubscriptionStore((s) => s.activeId);
  const activeName = useSubscriptionStore((s) => s.activeName);

  const certs = useArmList<WebCert>("/providers/Microsoft.Web/certificates", ArmApi.web);

  const rows: CertRow[] = (certs.data?.value ?? []).map((c) => {
    const days = daysUntil(c.properties?.expirationDate);
    return {
      id: c.id,
      name: c.name,
      resourceGroup: resourceGroupFromId(c.id),
      subject: c.properties?.subjectName ?? "—",
      hosts: (c.properties?.hostNames ?? []).join(", ") || "—",
      expiry: c.properties?.expirationDate ? new Date(c.properties.expirationDate).toLocaleDateString() : "—",
      daysLeft: days,
    };
  });
  rows.sort((a, b) => a.daysLeft - b.daysLeft);

  const expired = rows.filter((r) => r.daysLeft < 0).length;
  const soon30 = rows.filter((r) => r.daysLeft >= 0 && r.daysLeft <= 30).length;
  const soon90 = rows.filter((r) => r.daysLeft >= 0 && r.daysLeft <= 90).length;

  if (!activeId) return <NoSubscriptionState />;

  return (
    <>
      <PageHeader
        icon={<CalendarClock className="h-5 w-5" />}
        title="Certificate Expiry Radar"
        description="App Service certificates and their expiry, so a lapsed cert never takes a site down by surprise."
        actions={
          <ExportButtons
            filenameBase="certificates"
            title="Certificate Expiry"
            subtitle={activeName ?? undefined}
            rows={rows}
            columns={[
              { header: "Certificate", accessor: (r) => r.name },
              { header: "Subject", accessor: (r) => r.subject },
              { header: "Host Names", accessor: (r) => r.hosts },
              { header: "Resource Group", accessor: (r) => r.resourceGroup },
              { header: "Expires", accessor: (r) => r.expiry },
              { header: "Days Left", accessor: (r) => (Number.isFinite(r.daysLeft) ? r.daysLeft : "") },
            ]}
          />
        }
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Expired" value={expired} icon={<ShieldAlert className="h-4 w-4" />} loading={certs.isLoading} />
        <StatCard label="Expiring ≤ 30 days" value={soon30} loading={certs.isLoading} />
        <StatCard label="Expiring ≤ 90 days" value={soon90} loading={certs.isLoading} />
        <StatCard label="Certificates" value={rows.length} loading={certs.isLoading} />
      </div>

      {(expired > 0 || soon30 > 0) && (
        <Alert variant="destructive">
          <ShieldAlert className="h-4 w-4" />
          <AlertTitle>
            {expired + soon30} certificate{expired + soon30 === 1 ? "" : "s"} expired or expiring within 30 days
          </AlertTitle>
          <AlertDescription>Renew before expiry to avoid TLS handshake failures on the bound endpoints.</AlertDescription>
        </Alert>
      )}

      <Alert>
        <AlertTitle>Scope of this view</AlertTitle>
        <AlertDescription>
          This reads App Service certificates (<code>Microsoft.Web/certificates</code>), which
          expose their expiry through Azure Resource Manager. Key Vault certificate and secret
          expiry live on the Key Vault <em>data plane</em> and need an access policy / data-plane
          role beyond Reader — connect that scope to include them.
        </AlertDescription>
      </Alert>

      <DataTable
        rows={rows}
        columns={columns}
        isLoading={certs.isLoading}
        isError={certs.isError}
        error={certs.error}
        searchPlaceholder="Filter by name, subject, host…"
        emptyMessage="No App Service certificates found in this subscription."
        getRowId={(r) => r.id}
      />
    </>
  );
}
