"use client";

import * as React from "react";
import { Network, AlertTriangle, Layers } from "lucide-react";
import { PageHeader } from "@/components/data/PageHeader";
import { NoSubscriptionState } from "@/components/data/NoSubscriptionState";
import { StatCard } from "@/components/data/StatCard";
import { AlgorithmBadge } from "@/components/data/AlgorithmBadge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useArmList } from "@/lib/hooks/use-arm";
import { useSubscriptionStore } from "@/lib/hooks/use-subscription";
import { ArmApi } from "@/lib/azure/arm";
import { formatNumber } from "@/lib/utils";
import {
  subnetUtilisation,
  detectOverlaps,
  ipamSummary,
  type SubnetInput,
  type AddressSpace,
} from "@/lib/net/ipam";
import {
  auditOutbound,
  auditCoverage,
  type OutboundSubnet,
} from "@/lib/net/connectivity";
import type { NetworkInterface, VirtualNetwork } from "@/lib/azure/types";

/** Private endpoints expose a NIC with an ipConfiguration in a subnet. */
interface PrivateEndpoint {
  id: string;
  properties?: {
    subnet?: { id: string };
    networkInterfaces?: Array<{ id: string }>;
  };
}

function lc(s: string | undefined | null): string {
  return (s ?? "").toLowerCase();
}

export default function IpamPage() {
  const activeId = useSubscriptionStore((s) => s.activeId);
  const activeName = useSubscriptionStore((s) => s.activeName);

  const vnets = useArmList<VirtualNetwork>(
    "/providers/Microsoft.Network/virtualNetworks",
    ArmApi.network,
  );
  const nics = useArmList<NetworkInterface>(
    "/providers/Microsoft.Network/networkInterfaces",
    ArmApi.network,
  );
  const pes = useArmList<PrivateEndpoint>(
    "/providers/Microsoft.Network/privateEndpoints",
    ArmApi.network,
  );

  const anyLoading = vnets.isLoading || nics.isLoading || pes.isLoading;

  // Count allocated IPs per subnet id: NIC ipconfigs + private endpoints.
  const allocationBySubnet = React.useMemo(() => {
    const counts = new Map<string, number>();
    for (const nic of nics.data?.value ?? []) {
      for (const cfg of nic.properties?.ipConfigurations ?? []) {
        const sid = lc(cfg.properties?.subnet?.id);
        if (sid) counts.set(sid, (counts.get(sid) ?? 0) + 1);
      }
    }
    for (const pe of pes.data?.value ?? []) {
      const sid = lc(pe.properties?.subnet?.id);
      if (sid) counts.set(sid, (counts.get(sid) ?? 0) + 1);
    }
    return counts;
  }, [nics.data, pes.data]);

  const subnetInputs: SubnetInput[] = React.useMemo(() => {
    const out: SubnetInput[] = [];
    for (const vnet of vnets.data?.value ?? []) {
      for (const sub of vnet.properties?.subnets ?? []) {
        const prefix = sub.properties?.addressPrefix ?? "";
        if (!prefix) continue;
        out.push({
          id: sub.id,
          name: sub.name,
          vnet: vnet.name,
          addressPrefix: prefix,
          allocated: allocationBySubnet.get(lc(sub.id)) ?? 0,
        });
      }
    }
    return out;
  }, [vnets.data, allocationBySubnet]);

  const utils = React.useMemo(() => subnetUtilisation(subnetInputs), [subnetInputs]);
  const summary = React.useMemo(() => ipamSummary(utils), [utils]);

  // Overlap detection across VNet address spaces + subnet prefixes.
  const overlaps = React.useMemo(() => {
    const spaces: AddressSpace[] = [];
    for (const vnet of vnets.data?.value ?? []) {
      for (const cidr of vnet.properties?.addressSpace?.addressPrefixes ?? []) {
        spaces.push({ scope: vnet.name, cidr });
      }
    }
    return detectOverlaps(spaces);
  }, [vnets.data]);

  // Outbound / SNAT risk: approximate egress method per subnet.
  const outbound = React.useMemo(() => {
    const rows: OutboundSubnet[] = subnetInputs.map((s) => ({
      id: s.id,
      name: s.name,
      vnet: s.vnet,
      // Without NAT-gateway wiring here we mark default-snat as the
      // conservative assumption; the connectivity lib only flags at scale.
      method: "default-snat",
      workloadCount: s.allocated,
    }));
    return auditOutbound(rows);
  }, [subnetInputs]);

  const coverage = React.useMemo(
    () =>
      auditCoverage({
        publicIpCount: 0,
        ddosProtectedIpCount: 0,
        nsgCount: 0,
        nsgWithFlowLogs: 0,
        bastionCount: 0,
        vmsWithMgmtExposed: 0,
      }),
    [],
  );
  void coverage; // coverage audit surfaced on the Network Intelligence page

  if (!activeId) return <NoSubscriptionState />;

  return (
    <>
      <PageHeader
        icon={<Network className="h-5 w-5" />}
        title="IP Address Management"
        description={`Subnet capacity, CIDR overlaps, and outbound risk for ${activeName ?? "this subscription"}. Interval algebra — read-only.`}
      />

      <AlgorithmBadge keys={["subnetCapacity", "cidrOverlap"]} />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Subnets" value={summary.subnets} loading={anyLoading} />
        <StatCard
          label="Overall IP usage"
          value={`${(summary.overallUtil * 100).toFixed(0)}%`}
          delta={`${formatNumber(summary.totalAllocated)} / ${formatNumber(summary.totalUsable)} usable`}
          deltaTone={summary.overallUtil > 0.75 ? "negative" : "positive"}
          loading={anyLoading}
        />
        <StatCard
          label="Near capacity"
          value={summary.criticalCount + summary.warningCount}
          delta={`${summary.criticalCount} critical`}
          deltaTone={summary.criticalCount > 0 ? "negative" : "default"}
          loading={anyLoading}
        />
        <StatCard
          label="CIDR overlaps"
          value={overlaps.length}
          delta="break peering / VPN"
          deltaTone={overlaps.length > 0 ? "negative" : "positive"}
          loading={anyLoading}
        />
      </div>

      <Alert>
        <Layers className="h-4 w-4" />
        <AlertTitle>Why this matters</AlertTitle>
        <AlertDescription>
          Subnet exhaustion and overlapping address spaces are the two most
          common causes of failed Azure network changes. Usable IPs = the CIDR
          size minus Azure&apos;s 5 reserved addresses per subnet; allocation
          counts NIC IP configurations plus private endpoints.
        </AlertDescription>
      </Alert>

      {overlaps.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-semibold">
              <AlertTriangle className="h-4 w-4 text-primary" />
              Overlapping address spaces
            </CardTitle>
          </CardHeader>
          <CardContent className="pb-4">
            <ul className="space-y-2">
              {overlaps.map((o, i) => (
                <li key={i} className="flex flex-wrap items-center gap-2 rounded-md border bg-card/60 px-3 py-2 text-sm">
                  <span className="font-mono text-[11px]">{o.a.scope}</span>
                  <Badge variant="outline">{o.a.cidr}</Badge>
                  <span className="text-muted-foreground">overlaps</span>
                  <span className="font-mono text-[11px]">{o.b.scope}</span>
                  <Badge variant="outline">{o.b.cidr}</Badge>
                  <span className="ml-auto font-mono text-[10.5px] text-destructive">
                    {formatNumber(o.overlapSize)} addrs
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold">Subnet capacity</CardTitle>
        </CardHeader>
        <CardContent className="pb-4">
          {anyLoading ? (
            <p className="text-sm text-muted-foreground">Loading VNets, NICs, and private endpoints…</p>
          ) : utils.length === 0 ? (
            <p className="text-sm text-muted-foreground">No subnets found.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-sm">
                <thead className="border-b text-[11px] uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="px-2 py-1.5 text-left">Subnet</th>
                    <th className="px-2 py-1.5 text-left">VNet</th>
                    <th className="px-2 py-1.5 text-left">CIDR</th>
                    <th className="px-2 py-1.5 text-right">Usable</th>
                    <th className="px-2 py-1.5 text-right">Allocated</th>
                    <th className="px-2 py-1.5 text-right">Free</th>
                    <th className="px-2 py-1.5 text-left">Utilisation</th>
                  </tr>
                </thead>
                <tbody>
                  {utils.map((u) => (
                    <tr key={u.id} className="border-b last:border-0">
                      <td className="px-2 py-1.5 font-medium">{u.name}</td>
                      <td className="px-2 py-1.5 text-muted-foreground">{u.vnet}</td>
                      <td className="px-2 py-1.5 font-mono text-[11px]">{u.cidr}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums">{formatNumber(u.usable)}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums">{formatNumber(u.allocated)}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums">{formatNumber(u.free)}</td>
                      <td className="px-2 py-1.5">
                        <div className="flex items-center gap-2">
                          <div className="relative h-1.5 w-24 overflow-hidden rounded-full bg-muted">
                            <div
                              className={
                                u.severity === "critical"
                                  ? "absolute inset-y-0 left-0 rounded-full bg-destructive"
                                  : u.severity === "warning"
                                    ? "absolute inset-y-0 left-0 rounded-full bg-warning"
                                    : "absolute inset-y-0 left-0 rounded-full bg-success"
                              }
                              style={{ width: `${Math.min(100, u.utilisation * 100)}%` }}
                            />
                          </div>
                          <span className="tabular-nums text-[11px] text-muted-foreground">
                            {(u.utilisation * 100).toFixed(0)}%
                          </span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold">Outbound / SNAT exhaustion risk</CardTitle>
        </CardHeader>
        <CardContent className="pb-4">
          <ul className="space-y-2">
            {outbound.map((f, i) => (
              <li key={i} className="flex items-start gap-2 rounded-md border bg-card/60 px-3 py-2 text-sm">
                <Badge variant={f.severity === "warning" ? "warning" : "success"} className="mt-0.5 shrink-0">
                  {f.severity === "warning" ? "Risk" : "OK"}
                </Badge>
                <span className="text-muted-foreground">{f.detail}</span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </>
  );
}
