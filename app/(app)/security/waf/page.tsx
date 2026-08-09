"use client";

import * as React from "react";
import { ShieldCheck, DollarSign, RefreshCw, Lock, Wrench, Zap } from "lucide-react";
import { PageHeader } from "@/components/data/PageHeader";
import { NoSubscriptionState } from "@/components/data/NoSubscriptionState";
import { ExportButtons } from "@/components/data/ExportButtons";
import { StatCard } from "@/components/data/StatCard";
import { useArmList } from "@/lib/hooks/use-arm";
import { useSubscriptionStore } from "@/lib/hooks/use-subscription";
import { ArmApi } from "@/lib/azure/arm";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type {
  AdvisorRecommendation,
  AppService,
  Disk,
  NetworkSecurityGroup,
  PublicIpAddress,
  ResourceGroup,
  StorageAccount,
  VirtualMachine,
} from "@/lib/azure/types";
import { classifyHardening } from "@/lib/azure/hardening";
import { resourceNameFromId } from "@/lib/utils";

interface Finding {
  status: "pass" | "warn" | "fail" | "info";
  text: string;
  /** Names of the specific resources this finding refers to, if known. */
  resources?: string[];
}

/** Extract the affected resource names from a set of Advisor recommendations. */
function advisorResourceNames(recs: AdvisorRecommendation[]): string[] {
  const names = new Set<string>();
  for (const r of recs) {
    const rid = r.properties?.resourceMetadata?.resourceId ?? "";
    const name = resourceNameFromId(rid);
    if (name) names.add(name);
  }
  return [...names];
}

interface Pillar {
  key: string;
  label: string;
  icon: React.ReactNode;
  color: string;
  score: number;
  findings: Finding[];
}

function grade(score: number): string {
  if (score >= 90) return "A";
  if (score >= 80) return "B";
  if (score >= 70) return "C";
  if (score >= 60) return "D";
  return "F";
}

function scoreTone(score: number): "positive" | "default" | "negative" {
  if (score >= 80) return "positive";
  if (score >= 60) return "default";
  return "negative";
}

export default function WafPage() {
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
  const apps = useArmList<AppService>(
    "/providers/Microsoft.Web/sites",
    ArmApi.web,
  );
  const advisor = useArmList<AdvisorRecommendation>(
    "/providers/Microsoft.Advisor/recommendations",
    ArmApi.advisor,
  );

  const anyLoading = [rgs, vms, disks, nsgs, pips, storage, apps, advisor].some(
    (q) => q.isLoading,
  );

  const vmList = vms.data?.value ?? [];
  const rgList = rgs.data?.value ?? [];

  // ============ COST ============
  const costRecs = (advisor.data?.value ?? []).filter(
    (r) => (r.properties?.category ?? "").toLowerCase() === "cost",
  );
  const highCostRecs = costRecs.filter((r) => (r.properties?.impact ?? "").toLowerCase() === "high");
  const highCost = highCostRecs.length;
  const unattachedDiskList = (disks.data?.value ?? []).filter((d) => !d.managedBy);
  const unattachedDisks = unattachedDiskList.length;
  const unusedPipList = (pips.data?.value ?? []).filter((p) => !p.properties?.ipConfiguration);
  const unusedPips = unusedPipList.length;

  let costScore = 100;
  const costFindings: Finding[] = [];
  if (highCost > 0) {
    costScore -= Math.min(30, highCost * 10);
    costFindings.push({ status: "fail", text: `${highCost} high-impact cost recommendations from Advisor`, resources: advisorResourceNames(highCostRecs) });
  } else if (costRecs.length > 0) {
    costScore -= Math.min(15, costRecs.length * 3);
    costFindings.push({ status: "warn", text: `${costRecs.length} cost recommendations from Advisor`, resources: advisorResourceNames(costRecs) });
  } else {
    costFindings.push({ status: "pass", text: "No cost recommendations — well optimized" });
  }
  if (unattachedDisks > 0) {
    costScore -= Math.min(20, unattachedDisks * 4);
    costFindings.push({ status: "fail", text: `${unattachedDisks} unattached managed disk${unattachedDisks === 1 ? "" : "s"} wasting spend`, resources: unattachedDiskList.map((d) => d.name) });
  } else {
    costFindings.push({ status: "pass", text: "No unattached managed disks" });
  }
  if (unusedPips > 0) {
    costScore -= Math.min(10, unusedPips * 2);
    costFindings.push({ status: "warn", text: `${unusedPips} unused public IPs (~$${(unusedPips * 3.65).toFixed(0)}/mo waste)`, resources: unusedPipList.map((p) => p.name) });
  } else {
    costFindings.push({ status: "pass", text: "No unused public IP addresses" });
  }

  // ============ RELIABILITY ============
  let relScore = 100;
  const relFindings: Finding[] = [];
  const singleInstanceList = vmList.filter(
    (vm) => !vm.zones?.length && !vm.properties?.availabilitySet,
  );
  const singleInstance = singleInstanceList.length;
  if (singleInstance > 0 && vmList.length > 0) {
    const pct = (singleInstance / vmList.length) * 100;
    relScore -= Math.min(30, Math.floor(pct * 0.4));
    relFindings.push({
      status: pct > 60 ? "fail" : "warn",
      text: `${singleInstance}/${vmList.length} VMs are single-instance (no zone/availability set)`,
      resources: singleInstanceList.map((v) => v.name),
    });
  } else if (vmList.length > 0) {
    relFindings.push({ status: "pass", text: `All ${vmList.length} VMs use zones or availability sets` });
  }
  // Backup coverage requires cross-referencing Recovery Vault protected items;
  // we surface it as informational since it needs additional per-vault calls.
  relFindings.push({
    status: "info",
    text: "Backup coverage requires Recovery Services Vault scan — see VM Backups view",
  });

  // ============ SECURITY ============
  let secScore = 100;
  const secFindings: Finding[] = [];
  const nsgList = nsgs.data?.value ?? [];
  let riskyRules = 0;
  const riskyNsgNames = new Set<string>();
  nsgList.forEach((n) => {
    (n.properties?.securityRules ?? []).forEach((r) => {
      const p = r.properties;
      const src = p.sourceAddressPrefix ?? "";
      const port = p.destinationPortRange ?? "";
      if (
        p.direction === "Inbound" &&
        p.access === "Allow" &&
        ["*", "0.0.0.0/0", "Internet"].includes(src) &&
        ["*", "22", "3389", "1433", "3306", "5432"].includes(port)
      ) {
        riskyRules++;
        riskyNsgNames.add(`${n.name} / ${r.name ?? "rule"}`);
      }
    });
  });
  if (riskyRules > 0) {
    secScore -= Math.min(30, riskyRules * 5);
    secFindings.push({ status: "fail", text: `${riskyRules} NSG rule${riskyRules === 1 ? "" : "s"} expose critical ports to the Internet`, resources: [...riskyNsgNames] });
  } else {
    secFindings.push({ status: "pass", text: "No NSG rules exposing SSH/RDP/DB to Internet" });
  }
  const storageList = storage.data?.value ?? [];
  const publicBlobList = storageList.filter((s) => s.properties?.allowBlobPublicAccess === true);
  const publicBlob = publicBlobList.length;
  if (publicBlob > 0) {
    secScore -= Math.min(20, publicBlob * 5);
    secFindings.push({ status: "fail", text: `${publicBlob} storage account${publicBlob === 1 ? "" : "s"} allow anonymous blob access`, resources: publicBlobList.map((s) => s.name) });
  } else if (storageList.length > 0) {
    secFindings.push({ status: "pass", text: "No public blob access on storage accounts" });
  }
  const httpStorageList = storageList.filter((s) => s.properties?.supportsHttpsTrafficOnly === false);
  const httpStorage = httpStorageList.length;
  if (httpStorage > 0) {
    secScore -= Math.min(15, httpStorage * 5);
    secFindings.push({ status: "fail", text: `${httpStorage} storage account${httpStorage === 1 ? "" : "s"} allow HTTP`, resources: httpStorageList.map((s) => s.name) });
  } else if (storageList.length > 0) {
    secFindings.push({ status: "pass", text: "All storage accounts enforce HTTPS" });
  }
  const httpAppList = (apps.data?.value ?? []).filter((a) => a.properties?.httpsOnly === false);
  const httpApps = httpAppList.length;
  if (httpApps > 0) {
    secScore -= Math.min(15, httpApps * 5);
    secFindings.push({ status: "fail", text: `${httpApps} App Service${httpApps === 1 ? "" : "s"} do not enforce HTTPS`, resources: httpAppList.map((a) => a.name) });
  } else if ((apps.data?.value ?? []).length > 0) {
    secFindings.push({ status: "pass", text: "All App Services enforce HTTPS-only" });
  }
  const nonHardenedList = vmList.filter((vm) => {
    const img = vm.properties?.storageProfile?.imageReference;
    const cls = classifyHardening(img?.publisher, img?.offer, img?.sku);
    return !(cls.level === "cis" || cls.level === "stig" || cls.level === "azure-baseline");
  });
  const hardened = vmList.length - nonHardenedList.length;
  if (vmList.length > 0) {
    const pct = (hardened / vmList.length) * 100;
    if (pct < 30) {
      secScore -= 15;
      secFindings.push({ status: "warn", text: `Only ${hardened}/${vmList.length} VMs use hardened images (${pct.toFixed(0)}%)`, resources: nonHardenedList.map((v) => v.name) });
    } else if (pct < 80) {
      secScore -= 10;
      secFindings.push({ status: "warn", text: `${hardened}/${vmList.length} VMs use hardened images (${pct.toFixed(0)}%)`, resources: nonHardenedList.map((v) => v.name) });
    } else {
      secFindings.push({ status: "pass", text: `${hardened}/${vmList.length} VMs use CIS/STIG hardened images` });
    }
  }
  const secRecs = (advisor.data?.value ?? []).filter(
    (r) => (r.properties?.category ?? "").toLowerCase() === "security",
  );
  if (secRecs.length > 0) {
    const highSecRecs = secRecs.filter((r) => (r.properties?.impact ?? "").toLowerCase() === "high");
    const high = highSecRecs.length;
    if (high > 0) {
      secScore -= Math.min(15, high * 5);
      secFindings.push({ status: "fail", text: `${high} high-impact security recommendations from Advisor`, resources: advisorResourceNames(highSecRecs) });
    } else {
      secScore -= Math.min(5, secRecs.length);
      secFindings.push({ status: "warn", text: `${secRecs.length} security recommendations from Advisor`, resources: advisorResourceNames(secRecs) });
    }
  }

  // ============ OPERATIONAL EXCELLENCE ============
  let opsScore = 100;
  const opsFindings: Finding[] = [];
  const untaggedRgList = rgList.filter((r) => !r.tags || Object.keys(r.tags).length === 0);
  const untaggedRgs = untaggedRgList.length;
  if (rgList.length > 0) {
    const pct = (untaggedRgs / rgList.length) * 100;
    if (untaggedRgs > 0) {
      opsScore -= Math.min(20, Math.floor(pct * 0.25));
      opsFindings.push({ status: pct > 50 ? "fail" : "warn", text: `${untaggedRgs}/${rgList.length} resource groups have no tags (${pct.toFixed(0)}%)`, resources: untaggedRgList.map((r) => r.name) });
    } else {
      opsFindings.push({ status: "pass", text: "All resource groups have tags" });
    }
  }
  const untaggedVmList = vmList.filter((v) => !v.tags || Object.keys(v.tags).length === 0);
  const untaggedVms = untaggedVmList.length;
  if (vmList.length > 0) {
    const pct = (untaggedVms / vmList.length) * 100;
    if (untaggedVms > 0) {
      opsScore -= Math.min(15, Math.floor(pct * 0.2));
      opsFindings.push({ status: "warn", text: `${untaggedVms}/${vmList.length} VMs have no tags`, resources: untaggedVmList.map((v) => v.name) });
    } else {
      opsFindings.push({ status: "pass", text: "All VMs have tags" });
    }
  }
  const opsRecs = (advisor.data?.value ?? []).filter(
    (r) => (r.properties?.category ?? "").toLowerCase() === "operationalexcellence",
  );
  if (opsRecs.length > 0) {
    opsScore -= Math.min(10, opsRecs.length * 2);
    opsFindings.push({ status: "warn", text: `${opsRecs.length} operational excellence recommendations`, resources: advisorResourceNames(opsRecs) });
  } else {
    opsFindings.push({ status: "pass", text: "No operational excellence recommendations" });
  }

  // ============ PERFORMANCE ============
  let perfScore = 100;
  const perfFindings: Finding[] = [];
  const perfRecs = (advisor.data?.value ?? []).filter(
    (r) => (r.properties?.category ?? "").toLowerCase() === "performance",
  );
  const highPerfRecs = perfRecs.filter((r) => (r.properties?.impact ?? "").toLowerCase() === "high");
  const highPerf = highPerfRecs.length;
  if (highPerf > 0) {
    perfScore -= Math.min(25, highPerf * 8);
    perfFindings.push({ status: "fail", text: `${highPerf} high-impact performance recommendations from Advisor`, resources: advisorResourceNames(highPerfRecs) });
  } else if (perfRecs.length > 0) {
    perfScore -= Math.min(10, perfRecs.length * 3);
    perfFindings.push({ status: "warn", text: `${perfRecs.length} performance recommendations from Advisor`, resources: advisorResourceNames(perfRecs) });
  } else {
    perfFindings.push({ status: "pass", text: "No performance recommendations" });
  }
  const burstableList = vmList.filter((v) => {
    const size = v.properties?.hardwareProfile?.vmSize ?? "";
    return size.toLowerCase().includes("standard_b") || size.toLowerCase().includes("_b");
  });
  const burstable = burstableList.length;
  if (vmList.length > 0) {
    const pct = (burstable / vmList.length) * 100;
    if (pct > 70) {
      perfScore -= 10;
      perfFindings.push({ status: "warn", text: `${burstable}/${vmList.length} VMs are burstable B-series (${pct.toFixed(0)}%) — may throttle under sustained load`, resources: burstableList.map((v) => v.name) });
    }
  }

  const pillars: Pillar[] = [
    {
      key: "cost",
      label: "Cost Optimization",
      icon: <DollarSign className="h-4 w-4" />,
      color: "bg-blue-500",
      score: Math.max(0, costScore),
      findings: costFindings,
    },
    {
      key: "reliability",
      label: "Reliability",
      icon: <RefreshCw className="h-4 w-4" />,
      color: "bg-emerald-500",
      score: Math.max(0, relScore),
      findings: relFindings,
    },
    {
      key: "security",
      label: "Security",
      icon: <Lock className="h-4 w-4" />,
      color: "bg-rose-500",
      score: Math.max(0, secScore),
      findings: secFindings,
    },
    {
      key: "ops",
      label: "Operational Excellence",
      icon: <Wrench className="h-4 w-4" />,
      color: "bg-amber-500",
      score: Math.max(0, opsScore),
      findings: opsFindings,
    },
    {
      key: "perf",
      label: "Performance Efficiency",
      icon: <Zap className="h-4 w-4" />,
      color: "bg-purple-500",
      score: Math.max(0, perfScore),
      findings: perfFindings,
    },
  ];

  const overall = Math.round(pillars.reduce((s, p) => s + p.score, 0) / pillars.length);
  const exportRows = pillars.flatMap((p) =>
    p.findings.map((f) => ({
      pillar: p.label,
      score: p.score,
      severity: f.status.toUpperCase(),
      finding: f.text,
      resources: (f.resources ?? []).join("; "),
    })),
  );

  if (!activeId) return <NoSubscriptionState />;

  return (
    <>
      <PageHeader
        icon={<ShieldCheck className="h-5 w-5" />}
        title="Well-Architected Framework Review"
        description={`Automated 5-pillar assessment for ${activeName ?? "this subscription"}.`}
        actions={
          <ExportButtons
            filenameBase="waf_review"
            title="Well-Architected Framework Review"
            subtitle={activeName ?? undefined}
            rows={exportRows}
            columns={[
              { header: "Pillar", accessor: (r) => r.pillar },
              { header: "Pillar Score", accessor: (r) => `${r.score}` },
              { header: "Severity", accessor: (r) => r.severity },
              { header: "Finding", accessor: (r) => r.finding },
              { header: "Affected Resources", accessor: (r) => r.resources },
            ]}
          />
        }
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-6">
        <StatCard
          label="Overall Score"
          value={`${overall}%`}
          delta={`Grade ${grade(overall)}`}
          deltaTone={scoreTone(overall)}
          className="md:col-span-2"
          icon={<ShieldCheck className="h-4 w-4" />}
          loading={anyLoading}
        />
        {pillars.map((p) => (
          <StatCard
            key={p.key}
            label={p.label.split(" ")[0]}
            value={`${p.score}`}
            delta={`${grade(p.score)}`}
            deltaTone={scoreTone(p.score)}
            icon={p.icon}
            loading={anyLoading}
          />
        ))}
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {pillars.map((p) => (
          <Card key={p.key}>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm font-semibold">
                <span className={`flex h-6 w-6 items-center justify-center rounded-md text-white ${p.color}`}>
                  {p.icon}
                </span>
                {p.label}
                <Badge
                  variant={p.score >= 80 ? "success" : p.score >= 60 ? "warning" : "destructive"}
                  className="ml-auto"
                >
                  {p.score}%
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2.5 text-sm">
                {p.findings.map((f, i) => (
                  <li key={i} className="flex gap-2">
                    <span className="mt-1 text-xs">
                      {f.status === "pass" && "🟢"}
                      {f.status === "warn" && "🟡"}
                      {f.status === "fail" && "🔴"}
                      {f.status === "info" && "ℹ"}
                    </span>
                    <div className="min-w-0 flex-1">
                      <span>{f.text}</span>
                      {f.resources && f.resources.length > 0 && (
                        <ResourceChips names={f.resources} />
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        ))}
      </div>
    </>
  );
}

/**
 * Renders the affected resource names for a finding as compact chips. Caps
 * the visible count so a finding touching 40 resources doesn't blow up the
 * card; the rest collapse into a "+N more" toggle.
 */
function ResourceChips({ names }: { names: string[] }) {
  const [expanded, setExpanded] = React.useState(false);
  const CAP = 12;
  const visible = expanded ? names : names.slice(0, CAP);
  const hidden = names.length - visible.length;
  return (
    <div className="mt-1.5 flex flex-wrap gap-1">
      {visible.map((n) => (
        <span
          key={n}
          className="rounded border bg-muted/60 px-1.5 py-0.5 font-mono text-[10.5px] text-muted-foreground"
          title={n}
        >
          {n}
        </span>
      ))}
      {hidden > 0 && (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="rounded border border-primary/40 bg-primary/10 px-1.5 py-0.5 text-[10.5px] font-medium text-primary hover:bg-primary/20"
        >
          +{hidden} more
        </button>
      )}
      {expanded && names.length > CAP && (
        <button
          type="button"
          onClick={() => setExpanded(false)}
          className="rounded border px-1.5 py-0.5 text-[10.5px] font-medium text-muted-foreground hover:bg-muted/60"
        >
          Show less
        </button>
      )}
    </div>
  );
}
