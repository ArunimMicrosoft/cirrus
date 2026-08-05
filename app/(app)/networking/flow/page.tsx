"use client";

import * as React from "react";
import {
  Route,
  ShieldAlert,
  ShieldCheck,
  PlayCircle,
  Server,
  Network,
  Shield,
  Globe2,
  Layers,
  ArrowDown,
  ChevronDown,
} from "lucide-react";
import { PageHeader } from "@/components/data/PageHeader";
import { DataTable, type DataColumn } from "@/components/data/DataTable";
import { NoSubscriptionState } from "@/components/data/NoSubscriptionState";
import { ExportButtons } from "@/components/data/ExportButtons";
import { StatCard } from "@/components/data/StatCard";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useArmList } from "@/lib/hooks/use-arm";
import { useSubscriptionStore } from "@/lib/hooks/use-subscription";
import { ArmApi } from "@/lib/azure/arm";
import { resourceGroupFromId, resourceNameFromId } from "@/lib/utils";
import { cn } from "@/lib/utils";
import type {
  NetworkInterface,
  NetworkSecurityGroup,
  PublicIpAddress,
  VirtualMachine,
  VirtualNetwork,
} from "@/lib/azure/types";

/* -----------------------------------------------------------
 * Shared types + rule flattening (reused across all 3 tabs)
 * -----------------------------------------------------------*/

interface FlatRule {
  priority: number;
  name: string;
  type: "Custom" | "Default";
  direction: "Inbound" | "Outbound";
  access: "Allow" | "Deny";
  protocol: string;
  source: string;
  sourcePorts: string;
  dest: string;
  destPort: string;
  risk: "critical" | "high" | "medium" | "low" | "internal" | "block";
  /** Which NSG this rule came from (used by the merged VM-scope view). */
  appliedAt?: string;
}

const DEFAULT_RULES: FlatRule[] = [
  { priority: 65000, name: "AllowVnetInBound", type: "Default", direction: "Inbound", access: "Allow", protocol: "*", source: "VirtualNetwork", sourcePorts: "*", dest: "VirtualNetwork", destPort: "*", risk: "internal" },
  { priority: 65001, name: "AllowAzureLoadBalancerInBound", type: "Default", direction: "Inbound", access: "Allow", protocol: "*", source: "AzureLoadBalancer", sourcePorts: "*", dest: "*", destPort: "*", risk: "low" },
  { priority: 65500, name: "DenyAllInBound", type: "Default", direction: "Inbound", access: "Deny", protocol: "*", source: "*", sourcePorts: "*", dest: "*", destPort: "*", risk: "block" },
  { priority: 65000, name: "AllowVnetOutBound", type: "Default", direction: "Outbound", access: "Allow", protocol: "*", source: "VirtualNetwork", sourcePorts: "*", dest: "VirtualNetwork", destPort: "*", risk: "internal" },
  { priority: 65001, name: "AllowInternetOutBound", type: "Default", direction: "Outbound", access: "Allow", protocol: "*", source: "*", sourcePorts: "*", dest: "Internet", destPort: "*", risk: "low" },
  { priority: 65500, name: "DenyAllOutBound", type: "Default", direction: "Outbound", access: "Deny", protocol: "*", source: "*", sourcePorts: "*", dest: "*", destPort: "*", risk: "block" },
];

const CRITICAL_PORTS = new Set(["22", "3389"]);
const HIGH_PORTS = new Set(["1433", "3306", "5432", "80"]);
const OPEN_SOURCES = new Set(["*", "0.0.0.0/0", "Internet"]);

function classifyRisk(r: Omit<FlatRule, "risk">): FlatRule["risk"] {
  if (r.access === "Deny") return "block";
  if (OPEN_SOURCES.has(r.source)) {
    if (r.destPort === "*" || CRITICAL_PORTS.has(r.destPort)) return "critical";
    if (HIGH_PORTS.has(r.destPort)) return "high";
    return "medium";
  }
  if (r.source === "VirtualNetwork") return "internal";
  if (r.source === "AzureLoadBalancer") return "low";
  return "low";
}

function flattenRules(nsg: NetworkSecurityGroup, appliedAt?: string): FlatRule[] {
  const custom = (nsg.properties?.securityRules ?? []).map((rule) => {
    const p = rule.properties;
    const src = p.sourceAddressPrefixes?.join(", ") || p.sourceAddressPrefix || "*";
    const dst = p.destinationAddressPrefix ?? "*";
    const dstPort = p.destinationPortRanges?.join(", ") || p.destinationPortRange || "*";
    const base: Omit<FlatRule, "risk"> = {
      priority: p.priority,
      name: rule.name,
      type: "Custom",
      direction: p.direction,
      access: p.access,
      protocol: p.protocol || "*",
      source: src,
      sourcePorts: p.sourcePortRange || "*",
      dest: dst,
      destPort: dstPort,
      appliedAt,
    };
    return { ...base, risk: classifyRisk(base) };
  });
  const withDefaults = [
    ...custom,
    ...DEFAULT_RULES.map((r) => ({ ...r, appliedAt })),
  ];
  return withDefaults.sort((a, b) => {
    if (a.direction !== b.direction) return a.direction === "Inbound" ? -1 : 1;
    return a.priority - b.priority;
  });
}

function RiskBadge({ risk }: { risk: FlatRule["risk"] }) {
  if (risk === "critical")
    return (
      <Badge variant="destructive">
        <ShieldAlert className="mr-1 h-3 w-3" />
        Critical
      </Badge>
    );
  if (risk === "high") return <Badge variant="destructive">High</Badge>;
  if (risk === "medium") return <Badge variant="warning">Medium</Badge>;
  if (risk === "internal") return <Badge variant="secondary">Internal</Badge>;
  if (risk === "block") return <Badge variant="secondary">Block</Badge>;
  return <Badge variant="outline">Low</Badge>;
}

/* -----------------------------------------------------------
 * Traffic flow simulator (state machine)
 * -----------------------------------------------------------*/

interface SimResult {
  decision: "ALLOW" | "DENY";
  matched: FlatRule | null;
  reasoning: string[];
  trace: Array<{
    priority: number;
    name: string;
    protoMatch: boolean;
    srcMatch: boolean;
    portMatch: boolean;
    result: "match-allow" | "match-deny" | "skip";
  }>;
}

function isPrivateIp(ip: string): boolean {
  return (
    ip.startsWith("10.") ||
    ip.startsWith("172.16.") || ip.startsWith("172.17.") ||
    ip.startsWith("172.18.") || ip.startsWith("172.19.") ||
    ip.startsWith("172.2") || ip.startsWith("172.30.") ||
    ip.startsWith("172.31.") || ip.startsWith("192.168.")
  );
}

function portInRange(rulePort: string, testPort: string): boolean {
  if (rulePort === "*") return true;
  const parts = rulePort.split(",").map((p) => p.trim());
  for (const p of parts) {
    if (p === testPort) return true;
    if (p.includes("-")) {
      const [lo, hi] = p.split("-").map((n) => Number(n.trim()));
      const t = Number(testPort);
      if (Number.isFinite(t) && Number.isFinite(lo) && Number.isFinite(hi) && t >= lo && t <= hi) return true;
    }
  }
  return false;
}

function sourceMatches(ruleSrc: string, testSrc: string): boolean {
  if (ruleSrc === "*" || ruleSrc === "0.0.0.0/0") return true;
  if (ruleSrc === testSrc) return true;
  if (ruleSrc.includes(",")) {
    return ruleSrc.split(",").some((s) => sourceMatches(s.trim(), testSrc));
  }
  if (ruleSrc === "Internet") return !isPrivateIp(testSrc) && testSrc !== "VirtualNetwork" && testSrc !== "AzureLoadBalancer";
  if (ruleSrc === "VirtualNetwork") return isPrivateIp(testSrc) || testSrc === "VirtualNetwork";
  if (ruleSrc === "AzureLoadBalancer") return testSrc === "AzureLoadBalancer";
  if (ruleSrc.includes("/")) {
    const [prefix] = ruleSrc.split("/");
    return testSrc.startsWith(prefix.split(".").slice(0, 3).join("."));
  }
  return false;
}

function simulate(
  rules: FlatRule[],
  direction: "Inbound" | "Outbound",
  source: string,
  destPort: string,
  protocol: string,
): SimResult {
  const dirRules = rules.filter((r) => r.direction === direction);
  const trace: SimResult["trace"] = [];
  const reasoning: string[] = [];

  for (const rule of dirRules) {
    const protoMatch = rule.protocol === "*" || rule.protocol.toUpperCase() === protocol.toUpperCase();
    const srcMatch = sourceMatches(rule.source, source);
    const portMatch = portInRange(rule.destPort, destPort);

    if (protoMatch && srcMatch && portMatch) {
      trace.push({
        priority: rule.priority, name: rule.name,
        protoMatch, srcMatch, portMatch,
        result: rule.access === "Allow" ? "match-allow" : "match-deny",
      });
      reasoning.push(`Rule ${rule.priority} (${rule.name}) matches: ${rule.access.toUpperCase()}.`);
      return { decision: rule.access === "Allow" ? "ALLOW" : "DENY", matched: rule, reasoning, trace };
    }
    trace.push({ priority: rule.priority, name: rule.name, protoMatch, srcMatch, portMatch, result: "skip" });
  }
  reasoning.push("No matching rule found — implicit deny.");
  return { decision: "DENY", matched: null, reasoning, trace };
}

/* -----------------------------------------------------------
 * Page
 * -----------------------------------------------------------*/

export default function NetworkFlowPage() {
  const activeId = useSubscriptionStore((s) => s.activeId);
  const activeName = useSubscriptionStore((s) => s.activeName);

  const nsgs = useArmList<NetworkSecurityGroup>(
    "/providers/Microsoft.Network/networkSecurityGroups",
    ArmApi.network,
  );
  const vms = useArmList<VirtualMachine>(
    "/providers/Microsoft.Compute/virtualMachines",
    ArmApi.computeVms,
  );
  const nics = useArmList<NetworkInterface>(
    "/providers/Microsoft.Network/networkInterfaces",
    ArmApi.network,
  );
  const pips = useArmList<PublicIpAddress>(
    "/providers/Microsoft.Network/publicIPAddresses",
    ArmApi.network,
  );
  const vnets = useArmList<VirtualNetwork>(
    "/providers/Microsoft.Network/virtualNetworks",
    ArmApi.network,
  );

  const loading =
    nsgs.isLoading || vms.isLoading || nics.isLoading || pips.isLoading || vnets.isLoading;

  if (!activeId) return <NoSubscriptionState />;

  return (
    <>
      <PageHeader
        icon={<Route className="h-5 w-5" />}
        title="Network Flow Analyzer"
        description={`NSG rules, VM path tracing, and traffic simulation for ${activeName ?? "this subscription"}.`}
      />

      <Tabs defaultValue="path" className="w-full">
        <TabsList>
          <TabsTrigger value="path">
            <Route className="h-3.5 w-3.5" />
            VM Network Path
          </TabsTrigger>
          <TabsTrigger value="rules">
            <Shield className="h-3.5 w-3.5" />
            NSG Rule Viewer
          </TabsTrigger>
          <TabsTrigger value="simulator">
            <PlayCircle className="h-3.5 w-3.5" />
            Traffic Simulator
          </TabsTrigger>
        </TabsList>

        <TabsContent value="path">
          <VmPathTab
            vms={vms.data?.value ?? []}
            nics={nics.data?.value ?? []}
            nsgs={nsgs.data?.value ?? []}
            pips={pips.data?.value ?? []}
            vnets={vnets.data?.value ?? []}
            loading={loading}
          />
        </TabsContent>

        <TabsContent value="rules">
          <NsgViewerTab nsgs={nsgs.data?.value ?? []} loading={nsgs.isLoading} />
        </TabsContent>

        <TabsContent value="simulator">
          <SimulatorTab nsgs={nsgs.data?.value ?? []} />
        </TabsContent>
      </Tabs>
    </>
  );
}

/* -----------------------------------------------------------
 * TAB 1 — VM Network Path
 * -----------------------------------------------------------*/

interface NicDetail {
  nic: NetworkInterface;
  name: string;
  privateIp: string;
  publicIp?: PublicIpAddress;
  nicNsg?: NetworkSecurityGroup;
  subnetNsg?: NetworkSecurityGroup;
  subnetName: string;
  subnetPrefix: string;
  vnetName: string;
  vnet?: VirtualNetwork;
}

function buildNicDetails(
  vm: VirtualMachine,
  nics: NetworkInterface[],
  nsgs: NetworkSecurityGroup[],
  pips: PublicIpAddress[],
  vnets: VirtualNetwork[],
): NicDetail[] {
  const nicMap = new Map(nics.map((n) => [n.id.toLowerCase(), n]));
  const nsgMap = new Map(nsgs.map((n) => [n.id.toLowerCase(), n]));
  const pipMap = new Map(pips.map((p) => [p.id.toLowerCase(), p]));

  const vmNicRefs = vm.properties?.networkProfile?.networkInterfaces ?? [];
  const details: NicDetail[] = [];

  for (const nicRef of vmNicRefs) {
    const nic = nicMap.get(nicRef.id.toLowerCase());
    if (!nic) continue;

    const ipc = nic.properties?.ipConfigurations?.[0];
    const privateIp = ipc?.properties?.privateIPAddress ?? "-";
    const publicIp = ipc?.properties?.publicIPAddress?.id
      ? pipMap.get(ipc.properties.publicIPAddress.id.toLowerCase())
      : undefined;
    const nicNsg = nic.properties?.networkSecurityGroup?.id
      ? nsgMap.get(nic.properties.networkSecurityGroup.id.toLowerCase())
      : undefined;

    const subnetRef = ipc?.properties?.subnet?.id ?? "";
    const subnetName = subnetRef ? resourceNameFromId(subnetRef) : "-";
    const subnetParts = subnetRef.split("/");
    const vnetName =
      subnetParts.length > 3 && subnetRef.toLowerCase().includes("/virtualnetworks/")
        ? subnetParts[subnetParts.length - 3]
        : "";
    const vnet = vnets.find((v) => v.name === vnetName);
    const subnetObj = vnet?.properties?.subnets?.find(
      (s) => s.id?.toLowerCase() === subnetRef.toLowerCase(),
    );
    const subnetNsgId = subnetObj?.properties?.networkSecurityGroup?.id;
    const subnetNsg = subnetNsgId ? nsgMap.get(subnetNsgId.toLowerCase()) : undefined;

    details.push({
      nic,
      name: nic.name,
      privateIp,
      publicIp,
      nicNsg,
      subnetNsg,
      subnetName,
      subnetPrefix: subnetObj?.properties?.addressPrefix ?? "",
      vnetName,
      vnet,
    });
  }
  return details;
}

function VmPathTab({
  vms,
  nics,
  nsgs,
  pips,
  vnets,
  loading,
}: {
  vms: VirtualMachine[];
  nics: NetworkInterface[];
  nsgs: NetworkSecurityGroup[];
  pips: PublicIpAddress[];
  vnets: VirtualNetwork[];
  loading: boolean;
}) {
  const [selectedName, setSelectedName] = React.useState<string>("");

  const vmNames = React.useMemo(
    () => [...vms].sort((a, b) => a.name.localeCompare(b.name)).map((v) => v.name),
    [vms],
  );

  React.useEffect(() => {
    if (vmNames.length > 0 && !selectedName) setSelectedName(vmNames[0]);
  }, [vmNames, selectedName]);

  const vm = vms.find((v) => v.name === selectedName);
  const nicDetails = vm ? buildNicDetails(vm, nics, nsgs, pips, vnets) : [];

  return (
    <>
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Trace a VM's network path</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap items-end gap-3">
          <div>
            <Label className="mb-1 block text-xs">Virtual Machine</Label>
            <Select value={selectedName} onValueChange={setSelectedName}>
              <SelectTrigger className="w-80">
                <SelectValue placeholder={loading ? "Loading…" : "Select VM"} />
              </SelectTrigger>
              <SelectContent>
                {vmNames.map((n) => (
                  <SelectItem key={n} value={n}>
                    {n}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="text-[11px] text-muted-foreground">
            Path built from cached ARM data — VMs, NICs, NSGs, Public IPs, VNets.
          </div>
        </CardContent>
      </Card>

      {vm && nicDetails.length === 0 && !loading && (
        <Alert>
          <AlertTitle>No network interfaces resolved</AlertTitle>
          <AlertDescription>
            The VM has no attached NICs, or the NICs weren't returned by ARM.
          </AlertDescription>
        </Alert>
      )}

      {vm &&
        nicDetails.map((nd) => (
          <NicPathBlock
            key={nd.nic.id}
            vm={vm}
            nd={nd}
          />
        ))}
    </>
  );
}

/**
 * Renders one NIC's full network path with a vertical flow chart, hop table,
 * security assessment, and merged effective inbound rules from both NSG
 * (NIC-level and subnet-level) scopes.
 */
function NicPathBlock({ vm, nd }: { vm: VirtualMachine; nd: NicDetail }) {
  const hops = buildHops(vm, nd);
  const hasPip = Boolean(nd.publicIp);
  const hasNicNsg = Boolean(nd.nicNsg);
  const hasSubnetNsg = Boolean(nd.subnetNsg);

  const mergedRules: FlatRule[] = [];
  if (nd.nicNsg) {
    mergedRules.push(
      ...flattenRules(nd.nicNsg, `NIC: ${nd.nicNsg.name}`).filter(
        (r) => r.direction === "Inbound",
      ),
    );
  }
  if (nd.subnetNsg) {
    mergedRules.push(
      ...flattenRules(nd.subnetNsg, `Subnet: ${nd.subnetNsg.name}`).filter(
        (r) => r.direction === "Inbound",
      ),
    );
  }
  mergedRules.sort((a, b) => a.priority - b.priority);

  const ruleColumns: DataColumn<FlatRule>[] = [
    {
      key: "prio",
      header: "Prio",
      accessor: (r) => r.priority,
      cell: (r) => <span className="font-mono text-xs tabular-nums">{r.priority}</span>,
    },
    {
      key: "appliedAt",
      header: "Applied at",
      accessor: (r) => r.appliedAt ?? "",
      cell: (r) => (
        <span className="text-[11.5px] text-muted-foreground">{r.appliedAt}</span>
      ),
    },
    {
      key: "access",
      header: "Access",
      accessor: (r) => r.access,
      cell: (r) =>
        r.access === "Allow" ? (
          <Badge variant="success">Allow</Badge>
        ) : (
          <Badge variant="destructive">Deny</Badge>
        ),
    },
    { key: "risk", header: "Risk", accessor: (r) => r.risk, cell: (r) => <RiskBadge risk={r.risk} /> },
    { key: "proto", header: "Proto", accessor: (r) => r.protocol },
    {
      key: "src",
      header: "Source",
      accessor: (r) => r.source,
      cell: (r) => <span className="font-mono text-xs">{r.source}</span>,
    },
    {
      key: "port",
      header: "Port",
      accessor: (r) => r.destPort,
      cell: (r) => <span className="font-mono text-xs">{r.destPort}</span>,
    },
    {
      key: "name",
      header: "Rule",
      accessor: (r) => r.name,
      cell: (r) => (
        <span className="text-xs">
          {r.name}
          {r.type === "Default" && (
            <Badge variant="outline" className="ml-1.5 text-[9px]">
              default
            </Badge>
          )}
        </span>
      ),
    },
  ];

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm">
          <Network className="h-4 w-4 text-primary" />
          NIC: <span className="font-mono">{nd.name}</span>
          <span className="text-muted-foreground">
            · private IP {nd.privateIp}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Visual flow */}
        <div>
          <div className="mb-3 text-[11.5px] font-semibold uppercase tracking-wider text-muted-foreground">
            End-to-end path
          </div>
          <div className="space-y-0">
            {hops.map((h, i) => (
              <React.Fragment key={h.step}>
                <HopRow hop={h} />
                {i < hops.length - 1 && (
                  <div className="flex items-center pl-6 text-muted-foreground/60">
                    <ArrowDown className="h-3 w-3" />
                  </div>
                )}
              </React.Fragment>
            ))}
          </div>
        </div>

        {/* Security assessment */}
        <SecurityAssessment
          hasPip={hasPip}
          hasNicNsg={hasNicNsg}
          hasSubnetNsg={hasSubnetNsg}
        />

        {/* Merged effective inbound rules */}
        <div>
          <div className="mb-2 flex items-center justify-between">
            <div className="text-[11.5px] font-semibold uppercase tracking-wider text-muted-foreground">
              Effective inbound rules for this NIC
            </div>
            {mergedRules.length > 0 && (
              <ExportButtons
                filenameBase={`vm_path_${vm.name}_${nd.name}`}
                title={`VM Network Path — ${vm.name}/${nd.name}`}
                rows={mergedRules}
                columns={[
                  { header: "Priority", accessor: (r) => r.priority },
                  { header: "Applied At", accessor: (r) => r.appliedAt ?? "" },
                  { header: "Access", accessor: (r) => r.access },
                  { header: "Risk", accessor: (r) => r.risk },
                  { header: "Protocol", accessor: (r) => r.protocol },
                  { header: "Source", accessor: (r) => r.source },
                  { header: "Destination Port", accessor: (r) => r.destPort },
                  { header: "Rule", accessor: (r) => r.name },
                  { header: "Type", accessor: (r) => r.type },
                ]}
              />
            )}
          </div>
          {mergedRules.length > 0 ? (
            <>
              <p className="mb-2 text-[11.5px] text-muted-foreground">
                Rules from the NIC-scoped and subnet-scoped NSGs, merged by priority.
                Azure evaluates lowest priority first; the first match wins.
              </p>
              <DataTable
                rows={mergedRules}
                columns={ruleColumns}
                pageSize={20}
                searchPlaceholder="Filter rules…"
                getRowId={(r, i) => `${r.appliedAt}-${r.priority}-${r.name}-${i}`}
              />
            </>
          ) : (
            <Alert variant="destructive">
              <ShieldAlert className="h-4 w-4" />
              <AlertTitle>No NSG rules apply to this NIC</AlertTitle>
              <AlertDescription>
                Neither the NIC nor its subnet has an NSG. All inbound traffic
                permitted by Azure's default rules will reach the VM.
              </AlertDescription>
            </Alert>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

interface Hop {
  step: number;
  icon: React.ReactNode;
  kind: string;
  name: string;
  detail: string;
  tone: "ok" | "info" | "warn" | "danger" | "primary";
  status: string;
}

function buildHops(vm: VirtualMachine, nd: NicDetail): Hop[] {
  const hops: Hop[] = [];

  // 1. Public IP or "internal only"
  if (nd.publicIp) {
    hops.push({
      step: 1,
      icon: <Globe2 className="h-3.5 w-3.5" />,
      kind: "Public IP",
      name: nd.publicIp.name,
      detail: `IP: ${nd.publicIp.properties?.ipAddress ?? "Not assigned"} · SKU: ${nd.publicIp.sku?.name ?? "?"}`,
      tone: "warn",
      status: "Internet-facing",
    });
  } else {
    hops.push({
      step: 1,
      icon: <Globe2 className="h-3.5 w-3.5" />,
      kind: "Public IP",
      name: "(none)",
      detail: "No public IP assigned",
      tone: "ok",
      status: "Internal only",
    });
  }

  // 2. NIC-level NSG
  if (nd.nicNsg) {
    const custom = nd.nicNsg.properties?.securityRules?.length ?? 0;
    hops.push({
      step: 2,
      icon: <Shield className="h-3.5 w-3.5" />,
      kind: "NSG · NIC-scope",
      name: nd.nicNsg.name,
      detail: `${custom} custom rule${custom === 1 ? "" : "s"} + 6 default`,
      tone: "ok",
      status: "Active",
    });
  } else {
    hops.push({
      step: 2,
      icon: <Shield className="h-3.5 w-3.5" />,
      kind: "NSG · NIC-scope",
      name: "(none)",
      detail: "No NSG bound to this NIC",
      tone: "warn",
      status: "Unprotected",
    });
  }

  // 3. Subnet-level NSG
  if (nd.subnetNsg) {
    const custom = nd.subnetNsg.properties?.securityRules?.length ?? 0;
    hops.push({
      step: 3,
      icon: <Shield className="h-3.5 w-3.5" />,
      kind: "NSG · Subnet-scope",
      name: `${nd.subnetNsg.name} on ${nd.subnetName}`,
      detail: `${custom} custom rule${custom === 1 ? "" : "s"} + 6 default`,
      tone: "ok",
      status: "Active",
    });
  } else {
    hops.push({
      step: 3,
      icon: <Shield className="h-3.5 w-3.5" />,
      kind: "NSG · Subnet-scope",
      name: `(none) on ${nd.subnetName}`,
      detail: "No NSG bound to this subnet",
      tone: "warn",
      status: "Unprotected",
    });
  }

  // 4. Subnet
  hops.push({
    step: 4,
    icon: <Layers className="h-3.5 w-3.5" />,
    kind: "Subnet",
    name: nd.subnetName,
    detail: nd.subnetPrefix ? `CIDR: ${nd.subnetPrefix}` : "",
    tone: "info",
    status: "",
  });

  // 5. VNet
  if (nd.vnet) {
    const prefixes = nd.vnet.properties?.addressSpace?.addressPrefixes ?? [];
    const peerings = nd.vnet.properties?.virtualNetworkPeerings?.length ?? 0;
    hops.push({
      step: 5,
      icon: <Network className="h-3.5 w-3.5" />,
      kind: "VNet",
      name: nd.vnet.name,
      detail: `CIDR: ${prefixes.join(", ") || "?"} · ${peerings} peering${peerings === 1 ? "" : "s"}`,
      tone: "info",
      status: "",
    });
  } else if (nd.vnetName) {
    hops.push({
      step: 5,
      icon: <Network className="h-3.5 w-3.5" />,
      kind: "VNet",
      name: nd.vnetName,
      detail: "",
      tone: "info",
      status: "",
    });
  }

  // 6. VM
  const size = vm.properties?.hardwareProfile?.vmSize ?? "?";
  hops.push({
    step: 6,
    icon: <Server className="h-3.5 w-3.5" />,
    kind: "VM",
    name: vm.name,
    detail: `Size: ${size} · Private IP: ${nd.privateIp}`,
    tone: "primary",
    status: "Destination",
  });

  return hops;
}

function HopRow({ hop }: { hop: Hop }) {
  const toneClass = {
    ok: "border-emerald-500/30 bg-emerald-500/5 text-emerald-700 dark:text-emerald-400",
    info: "border-border bg-muted/30 text-foreground",
    warn: "border-amber-500/30 bg-amber-500/5 text-amber-700 dark:text-amber-400",
    danger: "border-rose-500/30 bg-rose-500/5 text-rose-700 dark:text-rose-400",
    primary: "border-primary/40 bg-primary/8 text-primary",
  }[hop.tone];

  const statusBadge = {
    ok: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
    info: "bg-muted text-muted-foreground",
    warn: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
    danger: "bg-rose-500/15 text-rose-700 dark:text-rose-400",
    primary: "bg-primary/15 text-primary",
  }[hop.tone];

  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-md border px-3 py-2.5",
        toneClass,
      )}
    >
      <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded bg-background/70">
        {hop.icon}
      </div>
      <div className="flex-shrink-0 font-mono text-[10.5px] font-semibold uppercase tracking-wider opacity-70">
        {hop.step}. {hop.kind}
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate font-mono text-[13px] font-medium text-foreground">
          {hop.name}
        </div>
        {hop.detail && (
          <div className="truncate text-[11px] text-muted-foreground">
            {hop.detail}
          </div>
        )}
      </div>
      {hop.status && (
        <span
          className={cn(
            "shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold",
            statusBadge,
          )}
        >
          {hop.status}
        </span>
      )}
    </div>
  );
}

function SecurityAssessment({
  hasPip,
  hasNicNsg,
  hasSubnetNsg,
}: {
  hasPip: boolean;
  hasNicNsg: boolean;
  hasSubnetNsg: boolean;
}) {
  const bothMissing = !hasNicNsg && !hasSubnetNsg;
  const oneMissing = !hasNicNsg || !hasSubnetNsg;

  const variant = bothMissing || hasPip ? "destructive" : oneMissing ? "warning" : "success";
  const Icon = bothMissing ? ShieldAlert : ShieldCheck;

  const title = bothMissing
    ? "No NSG on NIC or subnet"
    : hasPip
    ? "Internet-facing VM"
    : oneMissing
    ? "Partial NSG protection"
    : "Defense in depth: NIC + subnet NSGs both bound";

  const body = bothMissing
    ? "This NIC has no NSG at either scope. Any inbound traffic reaching the subnet will hit the VM directly."
    : hasPip
    ? `Public IP is bound. ${
        !hasNicNsg && !hasSubnetNsg
          ? "No NSG protects the VM."
          : !hasNicNsg
          ? "Only the subnet-scoped NSG is guarding this VM."
          : !hasSubnetNsg
          ? "Only the NIC-scoped NSG is guarding this VM."
          : "Both NIC and subnet NSGs are in effect."
      }`
    : oneMissing
    ? `Only the ${
        hasNicNsg ? "NIC-scoped" : "subnet-scoped"
      } NSG is applied. Consider defense-in-depth by adding the other scope.`
    : "Both NIC-scoped and subnet-scoped NSGs apply. First-match evaluation across the merged ruleset.";

  return (
    <Alert variant={variant}>
      <Icon className="h-4 w-4" />
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription>{body}</AlertDescription>
    </Alert>
  );
}

/* -----------------------------------------------------------
 * TAB 2 — NSG Rule Viewer (unchanged from prior version)
 * -----------------------------------------------------------*/

function NsgViewerTab({
  nsgs,
  loading,
}: {
  nsgs: NetworkSecurityGroup[];
  loading: boolean;
}) {
  const [selectedName, setSelectedName] = React.useState<string>("");
  const [directionFilter, setDirectionFilter] = React.useState<
    "All" | "Inbound" | "Outbound"
  >("All");

  React.useEffect(() => {
    if (nsgs.length > 0 && !selectedName) setSelectedName(nsgs[0].name);
  }, [nsgs, selectedName]);

  const selectedNsg = nsgs.find((n) => n.name === selectedName);
  const rules = selectedNsg ? flattenRules(selectedNsg) : [];
  const filteredRules =
    directionFilter === "All"
      ? rules
      : rules.filter((r) => r.direction === directionFilter);

  const critical = rules.filter((r) => r.risk === "critical");
  const high = rules.filter((r) => r.risk === "high");

  const columns: DataColumn<FlatRule>[] = [
    {
      key: "prio",
      header: "Prio",
      accessor: (r) => r.priority,
      cell: (r) => (
        <span className="font-mono text-xs tabular-nums">{r.priority}</span>
      ),
    },
    {
      key: "dir",
      header: "Dir",
      accessor: (r) => r.direction,
      cell: (r) => (
        <span className="text-xs">
          {r.direction === "Inbound" ? "↓ In" : "↑ Out"}
        </span>
      ),
    },
    {
      key: "access",
      header: "Access",
      accessor: (r) => r.access,
      cell: (r) =>
        r.access === "Allow" ? (
          <Badge variant="success">Allow</Badge>
        ) : (
          <Badge variant="destructive">Deny</Badge>
        ),
    },
    { key: "risk", header: "Risk", accessor: (r) => r.risk, cell: (r) => <RiskBadge risk={r.risk} /> },
    { key: "proto", header: "Proto", accessor: (r) => r.protocol },
    {
      key: "src",
      header: "Source",
      accessor: (r) => r.source,
      cell: (r) => <span className="font-mono text-xs">{r.source}</span>,
    },
    {
      key: "dst",
      header: "Dest",
      accessor: (r) => r.dest,
      cell: (r) => <span className="font-mono text-xs">{r.dest}</span>,
    },
    {
      key: "port",
      header: "Port",
      accessor: (r) => r.destPort,
      cell: (r) => <span className="font-mono text-xs">{r.destPort}</span>,
    },
    {
      key: "name",
      header: "Rule",
      accessor: (r) => r.name,
      cell: (r) => (
        <span className="text-xs">
          {r.name}
          {r.type === "Default" && (
            <Badge variant="outline" className="ml-1.5 text-[9px]">
              default
            </Badge>
          )}
        </span>
      ),
    },
  ];

  return (
    <>
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Pick an NSG</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap items-end gap-3">
          <div>
            <Label className="mb-1 block text-xs">NSG</Label>
            <Select value={selectedName} onValueChange={setSelectedName}>
              <SelectTrigger className="w-72">
                <SelectValue placeholder={loading ? "Loading…" : "Select NSG"} />
              </SelectTrigger>
              <SelectContent>
                {nsgs.map((n) => (
                  <SelectItem key={n.id} value={n.name}>
                    {n.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="mb-1 block text-xs">Direction</Label>
            <Select
              value={directionFilter}
              onValueChange={(v: "All" | "Inbound" | "Outbound") =>
                setDirectionFilter(v)
              }
            >
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="All">All</SelectItem>
                <SelectItem value="Inbound">Inbound</SelectItem>
                <SelectItem value="Outbound">Outbound</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {selectedNsg && (
            <ExportButtons
              filenameBase={`nsg_rules_${selectedName}`}
              title={`NSG Rules: ${selectedName}`}
              rows={filteredRules}
              columns={[
                { header: "Priority", accessor: (r) => r.priority },
                { header: "Direction", accessor: (r) => r.direction },
                { header: "Access", accessor: (r) => r.access },
                { header: "Risk", accessor: (r) => r.risk },
                { header: "Protocol", accessor: (r) => r.protocol },
                { header: "Source", accessor: (r) => r.source },
                { header: "Destination", accessor: (r) => r.dest },
                { header: "Dest Port", accessor: (r) => r.destPort },
                { header: "Rule Name", accessor: (r) => r.name },
                { header: "Type", accessor: (r) => r.type },
              ]}
            />
          )}
        </CardContent>
      </Card>

      {selectedNsg && (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <StatCard label="Custom rules" value={rules.filter((r) => r.type === "Custom").length} />
            <StatCard label="Default rules" value={rules.filter((r) => r.type === "Default").length} />
            <StatCard label="Critical" value={critical.length} deltaTone={critical.length > 0 ? "negative" : "positive"} />
            <StatCard label="High risk" value={high.length} deltaTone={high.length > 0 ? "negative" : "positive"} />
          </div>

          {critical.length > 0 && (
            <Alert variant="destructive">
              <ShieldAlert className="h-4 w-4" />
              <AlertTitle>
                {critical.length} critical rule{critical.length === 1 ? "" : "s"} open critical ports to the Internet
              </AlertTitle>
              <AlertDescription>
                Ports 22 / 3389 / "*" from `*` or `0.0.0.0/0`. Restrict these in the Azure Portal — this app is read-only.
              </AlertDescription>
            </Alert>
          )}

          <DataTable
            rows={filteredRules}
            columns={columns}
            isLoading={loading}
            searchPlaceholder="Filter by rule name, source, port…"
            pageSize={30}
            getRowId={(r, i) => `${r.direction}-${r.priority}-${r.name}-${i}`}
          />
        </>
      )}
    </>
  );
}

/* -----------------------------------------------------------
 * TAB 3 — Traffic Simulator (unchanged)
 * -----------------------------------------------------------*/

function SimulatorTab({ nsgs }: { nsgs: NetworkSecurityGroup[] }) {
  const [selectedName, setSelectedName] = React.useState<string>("");
  const [simDirection, setSimDirection] = React.useState<"Inbound" | "Outbound">("Inbound");
  const [simSource, setSimSource] = React.useState("0.0.0.0/0");
  const [simPort, setSimPort] = React.useState("443");
  const [simProto, setSimProto] = React.useState("TCP");
  const [simResult, setSimResult] = React.useState<SimResult | null>(null);

  React.useEffect(() => {
    if (nsgs.length > 0 && !selectedName) setSelectedName(nsgs[0].name);
  }, [nsgs, selectedName]);

  const selectedNsg = nsgs.find((n) => n.name === selectedName);
  const rules = selectedNsg ? flattenRules(selectedNsg) : [];

  const runSim = () => {
    if (!selectedNsg) return;
    setSimResult(simulate(rules, simDirection, simSource, simPort, simProto));
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm">
          <PlayCircle className="h-4 w-4 text-primary" />
          Simulate one packet against an NSG
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid gap-3 md:grid-cols-6">
          <div className="md:col-span-2">
            <Label className="mb-1 block text-xs">NSG</Label>
            <Select value={selectedName} onValueChange={setSelectedName}>
              <SelectTrigger>
                <SelectValue placeholder="Select NSG" />
              </SelectTrigger>
              <SelectContent>
                {nsgs.map((n) => (
                  <SelectItem key={n.id} value={n.name}>
                    {n.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="mb-1 block text-xs">Direction</Label>
            <Select value={simDirection} onValueChange={(v: "Inbound" | "Outbound") => setSimDirection(v)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Inbound">Inbound</SelectItem>
                <SelectItem value="Outbound">Outbound</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="mb-1 block text-xs">Protocol</Label>
            <Select value={simProto} onValueChange={setSimProto}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="TCP">TCP</SelectItem>
                <SelectItem value="UDP">UDP</SelectItem>
                <SelectItem value="ICMP">ICMP</SelectItem>
                <SelectItem value="*">Any</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="mb-1 block text-xs">Source</Label>
            <Input
              value={simSource}
              onChange={(e) => setSimSource(e.target.value)}
              placeholder="0.0.0.0/0"
            />
          </div>
          <div>
            <Label className="mb-1 block text-xs">Dest port</Label>
            <Input
              value={simPort}
              onChange={(e) => setSimPort(e.target.value)}
              placeholder="443"
            />
          </div>
        </div>
        <Button onClick={runSim} className="w-full md:w-auto">
          <PlayCircle className="h-4 w-4" />
          Simulate flow
        </Button>

        {simResult && (
          <div>
            <Alert
              variant={simResult.decision === "ALLOW" ? "success" : "destructive"}
            >
              {simResult.decision === "ALLOW" ? (
                <ShieldCheck className="h-4 w-4" />
              ) : (
                <ShieldAlert className="h-4 w-4" />
              )}
              <AlertTitle>Traffic {simResult.decision}</AlertTitle>
              <AlertDescription>{simResult.reasoning.join(" ")}</AlertDescription>
            </Alert>

            <div className="mt-3 rounded-md border">
              <table className="w-full text-xs">
                <thead className="bg-muted">
                  <tr>
                    <th className="p-2 text-left">Prio</th>
                    <th className="p-2 text-left">Rule</th>
                    <th className="p-2 text-center">Proto</th>
                    <th className="p-2 text-center">Src</th>
                    <th className="p-2 text-center">Port</th>
                    <th className="p-2 text-left">Result</th>
                  </tr>
                </thead>
                <tbody>
                  {simResult.trace.map((t, i) => (
                    <tr key={i} className="border-t">
                      <td className="p-2 font-mono tabular-nums">{t.priority}</td>
                      <td className="p-2">{t.name}</td>
                      <td className="p-2 text-center">{t.protoMatch ? "✓" : "×"}</td>
                      <td className="p-2 text-center">{t.srcMatch ? "✓" : "×"}</td>
                      <td className="p-2 text-center">{t.portMatch ? "✓" : "×"}</td>
                      <td className="p-2">
                        {t.result === "match-allow" && (
                          <Badge variant="success">ALLOW</Badge>
                        )}
                        {t.result === "match-deny" && (
                          <Badge variant="destructive">DENY</Badge>
                        )}
                        {t.result === "skip" && (
                          <span className="text-muted-foreground">skip</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// Silence unused-import warning without shipping a real ChevronDown.
void ChevronDown;
