"use client";

import {
  Cloud,
  Database,
  HardDrive,
  LayoutGrid,
  Server,
  ShieldAlert,
  Shield,
  Network,
  Home as HomeIcon,
  TrendingUp,
  Zap,
} from "lucide-react";
import { PageHeader } from "@/components/data/PageHeader";
import { StatCard } from "@/components/data/StatCard";
import { NoSubscriptionState } from "@/components/data/NoSubscriptionState";
import { useArmList } from "@/lib/hooks/use-arm";
import { useSubscriptionStore } from "@/lib/hooks/use-subscription";
import { ArmApi } from "@/lib/azure/arm";
import { formatNumber } from "@/lib/utils";
import type {
  ResourceGroup,
  VirtualMachine,
  NetworkSecurityGroup,
  PublicIpAddress,
  StorageAccount,
  AppService,
  SqlServer,
  Disk,
} from "@/lib/azure/types";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function DashboardPage() {
  const activeId = useSubscriptionStore((s) => s.activeId);
  const activeName = useSubscriptionStore((s) => s.activeName);

  const rgs = useArmList<ResourceGroup>("/resourcegroups", ArmApi.resourceGroups);
  const vms = useArmList<VirtualMachine>(
    "/providers/Microsoft.Compute/virtualMachines",
    ArmApi.computeVms,
  );
  const disks = useArmList<Disk>(
    "/providers/Microsoft.Compute/disks",
    ArmApi.computeDisks,
  );
  const nsgs = useArmList<NetworkSecurityGroup>(
    "/providers/Microsoft.Network/networkSecurityGroups",
    ArmApi.network,
  );
  const pips = useArmList<PublicIpAddress>(
    "/providers/Microsoft.Network/publicIPAddresses",
    ArmApi.network,
  );
  const storage = useArmList<StorageAccount>(
    "/providers/Microsoft.Storage/storageAccounts",
    ArmApi.storage,
  );
  const web = useArmList<AppService>(
    "/providers/Microsoft.Web/sites",
    ArmApi.web,
  );
  const sql = useArmList<SqlServer>(
    "/providers/Microsoft.Sql/servers",
    ArmApi.sql,
  );

  if (!activeId) return <NoSubscriptionState />;

  const errs = [rgs.error, vms.error, disks.error, nsgs.error, pips.error, storage.error, web.error, sql.error].filter(Boolean);

  const unattachedDisks = disks.data?.value.filter((d) => !d.managedBy).length ?? 0;
  const unusedPips = pips.data?.value.filter((p) => !p.properties?.ipConfiguration).length ?? 0;
  const untaggedRgs =
    rgs.data?.value.filter((r) => !r.tags || Object.keys(r.tags).length === 0).length ?? 0;

  // Risky inbound NSG rules from Internet.
  const risky =
    nsgs.data?.value.reduce((count, nsg) => {
      const rules = nsg.properties?.securityRules ?? [];
      return (
        count +
        rules.filter((rule) => {
          const p = rule.properties;
          const src = p.sourceAddressPrefix ?? "";
          const port = p.destinationPortRange ?? "";
          return (
            p.direction === "Inbound" &&
            p.access === "Allow" &&
            ["*", "0.0.0.0/0", "Internet"].includes(src) &&
            ["*", "22", "3389", "1433", "3306", "5432"].includes(port)
          );
        }).length
      );
    }, 0) ?? 0;

  // Region distribution across VMs.
  const regionCounts = new Map<string, number>();
  vms.data?.value.forEach((vm) => {
    regionCounts.set(vm.location, (regionCounts.get(vm.location) ?? 0) + 1);
  });
  const topRegions = [...regionCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);

  // Top VM sizes.
  const sizeCounts = new Map<string, number>();
  vms.data?.value.forEach((vm) => {
    const size = vm.properties?.hardwareProfile?.vmSize ?? "Unknown";
    sizeCounts.set(size, (sizeCounts.get(size) ?? 0) + 1);
  });
  const topSizes = [...sizeCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);

  const totalVms = vms.data?.value.length ?? 0;

  return (
    <>
      <PageHeader
        icon={<HomeIcon className="h-5 w-5" />}
        title="Dashboard"
        description={activeName ? `Live snapshot of ${activeName}` : "Live snapshot from Azure Resource Manager"}
      />

      {errs.length > 0 && errs[0] && (
        <Alert variant="destructive">
          <AlertTitle>Some resources failed to load</AlertTitle>
          <AlertDescription className="break-all font-mono text-xs">
            {errs[0] instanceof Error ? errs[0].message : String(errs[0])}
          </AlertDescription>
        </Alert>
      )}

      <section>
        <div className="mb-2 flex items-center gap-2">
          <div className="h-1 w-1 rounded-full bg-primary" />
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Inventory
          </h2>
        </div>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
          <StatCard
            label="Resource Groups"
            value={formatNumber(rgs.data?.value.length ?? 0)}
            icon={<LayoutGrid className="h-4 w-4" />}
            loading={rgs.isLoading}
          />
          <StatCard
            label="Virtual Machines"
            value={formatNumber(totalVms)}
            icon={<Server className="h-4 w-4" />}
            loading={vms.isLoading}
          />
          <StatCard
            label="Disks"
            value={formatNumber(disks.data?.value.length ?? 0)}
            icon={<HardDrive className="h-4 w-4" />}
            loading={disks.isLoading}
          />
          <StatCard
            label="Storage Accts"
            value={formatNumber(storage.data?.value.length ?? 0)}
            icon={<HardDrive className="h-4 w-4" />}
            loading={storage.isLoading}
          />
          <StatCard
            label="App Services"
            value={formatNumber(web.data?.value.length ?? 0)}
            icon={<Cloud className="h-4 w-4" />}
            loading={web.isLoading}
          />
          <StatCard
            label="SQL Servers"
            value={formatNumber(sql.data?.value.length ?? 0)}
            icon={<Database className="h-4 w-4" />}
            loading={sql.isLoading}
          />
        </div>
      </section>

      <section>
        <div className="mb-2 flex items-center gap-2">
          <div className="h-1 w-1 rounded-full bg-primary" />
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Health &amp; risk signals
          </h2>
        </div>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <StatCard
            label="NSGs"
            value={formatNumber(nsgs.data?.value.length ?? 0)}
            icon={<Shield className="h-4 w-4" />}
            loading={nsgs.isLoading}
          />
          <StatCard
            label="Public IPs"
            value={formatNumber(pips.data?.value.length ?? 0)}
            icon={<Network className="h-4 w-4" />}
            loading={pips.isLoading}
          />
          <StatCard
            label="Orphan resources"
            value={formatNumber(unattachedDisks + unusedPips)}
            delta={`${unattachedDisks} disks · ${unusedPips} IPs`}
            deltaTone={unattachedDisks + unusedPips > 0 ? "negative" : "positive"}
            icon={<HardDrive className="h-4 w-4" />}
            loading={disks.isLoading || pips.isLoading}
          />
          <StatCard
            label="Untagged RGs"
            value={formatNumber(untaggedRgs)}
            delta={`of ${rgs.data?.value.length ?? 0} total`}
            deltaTone={untaggedRgs > 0 ? "negative" : "positive"}
            icon={<LayoutGrid className="h-4 w-4" />}
            loading={rgs.isLoading}
          />
        </div>
      </section>

      {nsgs.isSuccess && (
        <Alert variant={risky > 0 ? "destructive" : "success"}>
          {risky > 0 ? (
            <ShieldAlert className="h-4 w-4" />
          ) : (
            <Shield className="h-4 w-4" />
          )}
          <AlertTitle>
            {risky > 0
              ? `${risky} NSG rule${risky === 1 ? "" : "s"} open to Internet on critical ports`
              : "No NSG rules exposing SSH / RDP / DB ports to Internet"}
          </AlertTitle>
          <AlertDescription>
            {risky > 0
              ? "Review inbound rules allowing 22 / 3389 / 1433 / 3306 / 5432 from '*' or '0.0.0.0/0'. Detailed audit in Network Security Groups."
              : "All inbound rules restrict SSH, RDP, and database ports to non-Internet sources."}
          </AlertDescription>
        </Alert>
      )}

      {totalVms > 0 && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm font-semibold">
                <TrendingUp className="h-4 w-4 text-primary" />
                Top regions by VM count
              </CardTitle>
            </CardHeader>
            <CardContent className="pb-4">
              {topRegions.length === 0 ? (
                <p className="text-sm text-muted-foreground">No VMs to break down.</p>
              ) : (
                <ul className="space-y-2">
                  {topRegions.map(([region, count]) => {
                    const pct = (count / totalVms) * 100;
                    return (
                      <li key={region}>
                        <div className="mb-1 flex items-center justify-between text-xs">
                          <span className="font-medium">{region}</span>
                          <span className="text-muted-foreground tabular-nums">
                            {count} · {pct.toFixed(0)}%
                          </span>
                        </div>
                        <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                          <div
                            className="h-full rounded-full bg-primary"
                            style={{ width: `${Math.max(4, pct)}%` }}
                          />
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm font-semibold">
                <Zap className="h-4 w-4 text-primary" />
                Most-used VM SKUs
              </CardTitle>
            </CardHeader>
            <CardContent className="pb-4">
              {topSizes.length === 0 ? (
                <p className="text-sm text-muted-foreground">No VMs to break down.</p>
              ) : (
                <ul className="space-y-2">
                  {topSizes.map(([size, count]) => {
                    const pct = (count / totalVms) * 100;
                    return (
                      <li key={size}>
                        <div className="mb-1 flex items-center justify-between text-xs">
                          <span className="font-mono font-medium">{size}</span>
                          <span className="text-muted-foreground tabular-nums">
                            {count} · {pct.toFixed(0)}%
                          </span>
                        </div>
                        <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                          <div
                            className="h-full rounded-full bg-primary/70"
                            style={{ width: `${Math.max(4, pct)}%` }}
                          />
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </>
  );
}
