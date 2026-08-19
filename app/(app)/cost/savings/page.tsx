"use client";

import { PiggyBank, Trash2, Coins, TrendingDown } from "lucide-react";
import { PageHeader } from "@/components/data/PageHeader";
import { StatCard } from "@/components/data/StatCard";
import { DataTable, type DataColumn } from "@/components/data/DataTable";
import { NoSubscriptionState } from "@/components/data/NoSubscriptionState";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useArmList } from "@/lib/hooks/use-arm";
import { useReservationRecommendations } from "@/lib/hooks/use-reservations";
import { useSubscriptionStore } from "@/lib/hooks/use-subscription";
import { ArmApi } from "@/lib/azure/arm";
import { formatCurrency } from "@/lib/utils";
import {
  estimateDiskMonthlyCost,
  estimatePublicIpMonthlyCost,
  estimateSnapshotMonthlyCost,
} from "@/lib/azure/prices";
import type { Disk, NetworkInterface, NetworkSecurityGroup, PublicIpAddress } from "@/lib/azure/types";
import type { NormalisedReservation } from "@/lib/cost/reservations";

interface Snapshot {
  id: string;
  name: string;
  location: string;
  properties?: { diskSizeGB?: number; timeCreated?: string };
}

const resColumns: DataColumn<NormalisedReservation>[] = [
  { key: "sku", header: "SKU", accessor: (r) => r.sku, cell: (r) => <span className="font-medium">{r.sku}</span> },
  { key: "region", header: "Region", accessor: (r) => r.region },
  { key: "term", header: "Term", accessor: (r) => r.term },
  { key: "qty", header: "Qty", accessor: (r) => r.quantity, cell: (r) => <span className="tabular-nums">{r.quantity}</span> },
  {
    key: "annual",
    header: "Est. annual saving",
    accessor: (r) => r.annualSavings,
    cell: (r) => <span className="tabular-nums font-medium text-success">{formatCurrency(r.annualSavings)}</span>,
  },
];

export default function SavingsPage() {
  const activeId = useSubscriptionStore((s) => s.activeId);

  const disks = useArmList<Disk>("/providers/Microsoft.Compute/disks", ArmApi.computeDisks);
  const pips = useArmList<PublicIpAddress>("/providers/Microsoft.Network/publicIPAddresses", ArmApi.network);
  const nics = useArmList<NetworkInterface>("/providers/Microsoft.Network/networkInterfaces", ArmApi.network);
  const nsgs = useArmList<NetworkSecurityGroup>("/providers/Microsoft.Network/networkSecurityGroups", ArmApi.network);
  const snapshots = useArmList<Snapshot>("/providers/Microsoft.Compute/snapshots", ArmApi.computeSnapshots);
  const reservations = useReservationRecommendations();

  // --- Orphan / idle waste (same estimators as the Orphan Resources view) ---
  let orphanMonthly = 0;
  let orphanCount = 0;
  const now = Date.now();
  for (const d of disks.data?.value ?? []) {
    if (d.managedBy) continue;
    orphanMonthly += estimateDiskMonthlyCost(d.sku?.name ?? "", d.properties?.diskSizeGB ?? 0);
    orphanCount++;
  }
  for (const p of pips.data?.value ?? []) {
    if (p.properties?.ipConfiguration) continue;
    orphanMonthly += estimatePublicIpMonthlyCost();
    orphanCount++;
  }
  for (const n of nics.data?.value ?? []) {
    if (n.properties?.virtualMachine?.id) continue;
    orphanCount++;
  }
  for (const g of nsgs.data?.value ?? []) {
    const attached = (g.properties?.networkInterfaces?.length ?? 0) + (g.properties?.subnets?.length ?? 0);
    if (attached === 0) orphanCount++;
  }
  for (const s of snapshots.data?.value ?? []) {
    const created = s.properties?.timeCreated ? Date.parse(s.properties.timeCreated) : NaN;
    if (!Number.isFinite(created)) continue;
    if ((now - created) / 86_400_000 < 30) continue;
    orphanMonthly += estimateSnapshotMonthlyCost(s.properties?.diskSizeGB ?? 0);
    orphanCount++;
  }
  const orphanAnnual = orphanMonthly * 12;

  const reservationAnnual = reservations.summary.totalAnnualSavings;
  const totalAnnual = orphanAnnual + reservationAnnual;

  const loading =
    disks.isLoading || pips.isLoading || nics.isLoading || nsgs.isLoading || snapshots.isLoading || reservations.isLoading;

  if (!activeId) return <NoSubscriptionState />;

  return (
    <>
      <PageHeader
        icon={<PiggyBank className="h-5 w-5" />}
        title="Savings Summary"
        description="Every identified saving in one number: idle-resource waste you can reclaim plus the reserved-instance savings Azure recommends from your real usage."
      />

      <Card className="border-success/40 bg-success/5">
        <CardContent className="flex flex-col items-start gap-1 py-6">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Total identified savings
          </div>
          <div className="font-display text-[44px] leading-none tabular-nums text-success">
            {loading ? "—" : `${formatCurrency(totalAnnual)}`}
            <span className="ml-2 text-[16px] font-medium text-muted-foreground">/ year</span>
          </div>
          <div className="mt-1 text-[12.5px] text-muted-foreground">
            {formatCurrency(orphanAnnual)}/yr from idle resources + {formatCurrency(reservationAnnual)}/yr from reservations.
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Idle-resource waste /yr" value={formatCurrency(orphanAnnual)} icon={<Trash2 className="h-4 w-4" />} loading={loading} />
        <StatCard label="Idle resources" value={orphanCount} loading={loading} />
        <StatCard label="Reservation savings /yr" value={formatCurrency(reservationAnnual)} icon={<Coins className="h-4 w-4" />} loading={loading} />
        <StatCard label="Reservation recommendations" value={reservations.recommendations.length} loading={loading} />
      </div>

      <Alert>
        <TrendingDown className="h-4 w-4" />
        <AlertTitle>Where these numbers come from</AlertTitle>
        <AlertDescription>
          Idle-resource waste is estimated from Azure retail list prices for unattached disks,
          public IPs, and stale snapshots (see <a href="/cost/orphans" className="font-medium underline">Orphan Resources</a>).
          Reservation savings come from Azure&apos;s own recommendation engine
          (Microsoft.Consumption), computed from your real 30-day usage — not a list-price guess.
          Read-only: nothing is purchased or deleted.
        </AlertDescription>
      </Alert>

      {reservations.isError && (
        <Alert>
          <AlertTitle>Reservation recommendations unavailable</AlertTitle>
          <AlertDescription>
            This subscription offer may not expose the Consumption recommendation API
            (some CSP/sponsored subscriptions return 404). Idle-resource savings above are
            unaffected.
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Reservation coverage recommendations</CardTitle>
        </CardHeader>
        <CardContent>
          <DataTable
            rows={reservations.recommendations}
            columns={resColumns}
            isLoading={reservations.isLoading}
            isError={false}
            searchPlaceholder="Filter by SKU or region…"
            emptyMessage="No reservation recommendations — usage is already covered or too low to benefit."
            getRowId={(r) => `${r.sku}|${r.region}|${r.term}`}
          />
        </CardContent>
      </Card>
    </>
  );
}
