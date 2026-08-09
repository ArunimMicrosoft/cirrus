/**
 * useAnomalies — the intelligence signal that lives in your browser.
 *
 * Fetches the same inventory the dashboard already fetches (React Query
 * dedupes the network calls), captures a per-day rollup into IndexedDB, and
 * runs the anomaly detector against the rolling 7-day baseline.
 *
 * Consumers just render `anomalies` — the persistence + detection is
 * handled here so both the Dashboard and the dedicated Signals page can
 * share a single implementation.
 */

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { useArmList } from "@/lib/hooks/use-arm";
import { useSubscriptionStore } from "@/lib/hooks/use-subscription";
import { ArmApi } from "@/lib/azure/arm";
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
import * as idb from "@/lib/idb";
import { detectAnomalies, type Anomaly } from "@/lib/ml/anomalies";

export interface AnomaliesResult {
  /** Detected anomalies, empty when nothing crosses a threshold. */
  anomalies: Anomaly[];
  /** How many baselines are stored for the active subscription. */
  sessionCount: number;
  /** All eight ARM lists have resolved and the rollup is trustworthy. */
  isReady: boolean;
  /** Whether any of the underlying ARM queries is still in flight. */
  isLoading: boolean;
  /** Live rollup used as the "current" reading for the detector. */
  currentMetrics: idb.BaselineMetrics;
  /** Active subscription id (for downstream messages). */
  activeId: string | null;
}

export function useAnomalies(): AnomaliesResult {
  const activeId = useSubscriptionStore((s) => s.activeId);

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
  const web = useArmList<AppService>("/providers/Microsoft.Web/sites", ArmApi.web);
  const sql = useArmList<SqlServer>("/providers/Microsoft.Sql/servers", ArmApi.sql);

  const isReady =
    rgs.isSuccess &&
    vms.isSuccess &&
    disks.isSuccess &&
    nsgs.isSuccess &&
    pips.isSuccess &&
    storage.isSuccess &&
    web.isSuccess &&
    sql.isSuccess;

  const isLoading =
    rgs.isLoading ||
    vms.isLoading ||
    disks.isLoading ||
    nsgs.isLoading ||
    pips.isLoading ||
    storage.isLoading ||
    web.isLoading ||
    sql.isLoading;

  const unattachedDisks =
    disks.data?.value.filter((d) => !d.managedBy).length ?? 0;
  const unusedPips =
    pips.data?.value.filter((p) => !p.properties?.ipConfiguration).length ?? 0;
  const untaggedRgs =
    rgs.data?.value.filter((r) => !r.tags || Object.keys(r.tags).length === 0)
      .length ?? 0;
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
  const publicStorage =
    storage.data?.value.filter(
      (s) => s.properties?.allowBlobPublicAccess === true,
    ).length ?? 0;
  const appServicesNoHttps =
    web.data?.value.filter((w) => w.properties?.httpsOnly === false).length ??
    0;

  const currentMetrics: idb.BaselineMetrics = {
    vmCount: vms.data?.value.length ?? 0,
    diskCount: disks.data?.value.length ?? 0,
    orphanDisks: unattachedDisks,
    orphanPips: unusedPips,
    publicIpCount: pips.data?.value.length ?? 0,
    nsgCount: nsgs.data?.value.length ?? 0,
    riskyNsgRules: risky,
    storageCount: storage.data?.value.length ?? 0,
    publicStorage,
    appServiceCount: web.data?.value.length ?? 0,
    appServicesNoHttps,
    sqlServerCount: sql.data?.value.length ?? 0,
    resourceGroupCount: rgs.data?.value.length ?? 0,
    untaggedResourceGroups: untaggedRgs,
  };

  const baselines = useQuery({
    queryKey: ["baselines-idb", activeId],
    queryFn: () =>
      activeId ? idb.listBaselines(activeId) : Promise.resolve([]),
    enabled: Boolean(activeId),
    staleTime: 10_000,
  });

  // Auto-capture baseline once per day per subscription. Fires only when
  // all ARM lists have resolved and only when a metric actually changed
  // (deps below). idb.putBaseline is idempotent within a calendar day.
  React.useEffect(() => {
    if (!activeId || !isReady) return;
    idb.putBaseline(activeId, currentMetrics).catch(() => {
      /* non-fatal */
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    activeId,
    isReady,
    currentMetrics.vmCount,
    currentMetrics.diskCount,
    currentMetrics.orphanDisks,
    currentMetrics.orphanPips,
    currentMetrics.publicIpCount,
    currentMetrics.nsgCount,
    currentMetrics.riskyNsgRules,
    currentMetrics.storageCount,
    currentMetrics.publicStorage,
    currentMetrics.appServiceCount,
    currentMetrics.appServicesNoHttps,
    currentMetrics.sqlServerCount,
    currentMetrics.resourceGroupCount,
    currentMetrics.untaggedResourceGroups,
  ]);

  const anomalies: Anomaly[] =
    isReady && baselines.data
      ? detectAnomalies(currentMetrics, baselines.data)
      : [];

  return {
    anomalies,
    sessionCount: baselines.data?.length ?? 0,
    isReady,
    isLoading,
    currentMetrics,
    activeId,
  };
}
