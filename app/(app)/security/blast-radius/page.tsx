"use client";

import * as React from "react";
import { Bomb, Server, Network, Shield, HardDrive, Layers } from "lucide-react";
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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useArmList } from "@/lib/hooks/use-arm";
import { useSubscriptionStore } from "@/lib/hooks/use-subscription";
import { ArmApi } from "@/lib/azure/arm";
import { resourceGroupFromId, resourceNameFromId } from "@/lib/utils";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import type {
  VirtualMachine,
  NetworkInterface,
  NetworkSecurityGroup,
  PublicIpAddress,
  Disk,
  VirtualNetwork,
} from "@/lib/azure/types";

interface Edge {
  resource: string;
  type: string;
  relationship: string;
  detail: string;
}

export default function BlastRadiusPage() {
  const activeId = useSubscriptionStore((s) => s.activeId);
  const activeName = useSubscriptionStore((s) => s.activeName);

  const vms = useArmList<VirtualMachine>(
    "/providers/Microsoft.Compute/virtualMachines",
    ArmApi.computeVms,
  );
  const nics = useArmList<NetworkInterface>(
    "/providers/Microsoft.Network/networkInterfaces",
    ArmApi.network,
  );
  const nsgs = useArmList<NetworkSecurityGroup>(
    "/providers/Microsoft.Network/networkSecurityGroups",
    ArmApi.network,
  );
  const pips = useArmList<PublicIpAddress>(
    "/providers/Microsoft.Network/publicIPAddresses",
    ArmApi.network,
  );
  const disks = useArmList<Disk>(
    "/providers/Microsoft.Compute/disks",
    ArmApi.computeDisks,
  );
  const vnets = useArmList<VirtualNetwork>(
    "/providers/Microsoft.Network/virtualNetworks",
    ArmApi.network,
  );

  const [resourceType, setResourceType] = React.useState<"vm" | "vnet" | "nsg">("vm");
  const [selectedName, setSelectedName] = React.useState<string>("");

  const options = React.useMemo(() => {
    if (resourceType === "vm") return (vms.data?.value ?? []).map((v) => v.name);
    if (resourceType === "vnet") return (vnets.data?.value ?? []).map((v) => v.name);
    return (nsgs.data?.value ?? []).map((n) => n.name);
  }, [resourceType, vms.data, vnets.data, nsgs.data]);

  React.useEffect(() => {
    if (!options.includes(selectedName)) setSelectedName(options[0] ?? "");
  }, [options, selectedName]);

  const nicById = new Map((nics.data?.value ?? []).map((n) => [n.id.toLowerCase(), n]));
  const nsgById = new Map((nsgs.data?.value ?? []).map((n) => [n.id.toLowerCase(), n]));
  const pipById = new Map((pips.data?.value ?? []).map((p) => [p.id.toLowerCase(), p]));

  const edges: Edge[] = [];
  let selectedInfo = "";
  let icon: React.ReactNode = <Bomb className="h-5 w-5" />;

  if (resourceType === "vm" && selectedName) {
    const vm = vms.data?.value.find((v) => v.name === selectedName);
    if (vm) {
      icon = <Server className="h-5 w-5" />;
      selectedInfo = `${vm.properties?.hardwareProfile?.vmSize ?? "?"} · ${vm.location} · RG ${resourceGroupFromId(vm.id)}`;

      const vmNicIds = (vm.properties?.networkProfile?.networkInterfaces ?? []).map((n) => n.id.toLowerCase());
      vmNicIds.forEach((nid) => {
        const nic = nicById.get(nid);
        if (!nic) return;
        edges.push({
          resource: nic.name,
          type: "NIC",
          relationship: "Attached to VM",
          detail: nic.properties?.ipConfigurations?.[0]?.properties?.privateIPAddress ?? "",
        });
        const nsgRef = nic.properties?.networkSecurityGroup?.id?.toLowerCase();
        if (nsgRef) {
          const nsg = nsgById.get(nsgRef);
          const ruleCount = nsg?.properties?.securityRules?.length ?? 0;
          edges.push({
            resource: nsg?.name ?? resourceNameFromId(nsgRef),
            type: "NSG (NIC)",
            relationship: "Protects NIC",
            detail: `${ruleCount} custom rule${ruleCount === 1 ? "" : "s"}`,
          });
        }
        (nic.properties?.ipConfigurations ?? []).forEach((ipc) => {
          const subnetId = ipc.properties?.subnet?.id ?? "";
          if (subnetId) {
            const parts = subnetId.split("/");
            const vnet = parts[parts.length - 3] ?? "";
            const subnet = parts[parts.length - 1] ?? "";
            edges.push({
              resource: `${vnet}/${subnet}`,
              type: "Subnet",
              relationship: "NIC connected to",
              detail: `In VNet ${vnet}`,
            });
          }
          const pipRefId = ipc.properties?.publicIPAddress?.id?.toLowerCase();
          if (pipRefId) {
            const pip = pipById.get(pipRefId);
            edges.push({
              resource: pip?.name ?? resourceNameFromId(pipRefId),
              type: "Public IP",
              relationship: "Exposed via NIC",
              detail: pip?.properties?.ipAddress ?? "Not assigned",
            });
          }
        });
      });

      const osDisk = vm.properties?.storageProfile?.osDisk;
      if (osDisk?.name) {
        edges.push({
          resource: osDisk.name,
          type: "OS Disk",
          relationship: "Boot disk",
          detail: `${osDisk.diskSizeGB ?? "?"} GB · ${osDisk.osType ?? ""}`,
        });
      }
      (vm.properties?.storageProfile?.dataDisks ?? []).forEach((dd) => {
        edges.push({
          resource: dd.name ?? "?",
          type: "Data Disk",
          relationship: `LUN ${dd.lun ?? "?"}`,
          detail: `${dd.diskSizeGB ?? "?"} GB`,
        });
      });
    }
  } else if (resourceType === "vnet" && selectedName) {
    const vnet = vnets.data?.value.find((v) => v.name === selectedName);
    if (vnet) {
      icon = <Network className="h-5 w-5" />;
      const cidr = vnet.properties?.addressSpace?.addressPrefixes?.join(", ") ?? "";
      selectedInfo = `${cidr} · ${vnet.location} · RG ${resourceGroupFromId(vnet.id)}`;
      (vnet.properties?.subnets ?? []).forEach((s) => {
        edges.push({
          resource: s.name,
          type: "Subnet",
          relationship: "Inside VNet",
          detail: s.properties?.addressPrefix ?? "",
        });
      });
      const vnetIdLower = vnet.id.toLowerCase();
      (nics.data?.value ?? []).forEach((nic) => {
        const subnetOwn = (nic.properties?.ipConfigurations ?? [])
          .map((ipc) => (ipc.properties?.subnet?.id ?? "").toLowerCase())
          .find((sId) => sId.startsWith(vnetIdLower + "/subnets/"));
        if (!subnetOwn) return;
        const vmName = nic.properties?.virtualMachine?.id
          ? resourceNameFromId(nic.properties.virtualMachine.id)
          : "(unattached)";
        edges.push({
          resource: nic.name,
          type: "NIC",
          relationship: "Uses VNet",
          detail: `VM: ${vmName}`,
        });
      });
    }
  } else if (resourceType === "nsg" && selectedName) {
    const nsg = nsgs.data?.value.find((n) => n.name === selectedName);
    if (nsg) {
      icon = <Shield className="h-5 w-5" />;
      selectedInfo = `${nsg.location} · RG ${resourceGroupFromId(nsg.id)}`;
      (nsg.properties?.networkInterfaces ?? []).forEach((n) => {
        edges.push({
          resource: resourceNameFromId(n.id),
          type: "NIC",
          relationship: "Protected by NSG",
          detail: "",
        });
      });
      (nsg.properties?.subnets ?? []).forEach((s) => {
        edges.push({
          resource: resourceNameFromId(s.id),
          type: "Subnet",
          relationship: "Protected by NSG",
          detail: "",
        });
      });
      (nsg.properties?.securityRules ?? []).forEach((r) => {
        edges.push({
          resource: r.name,
          type: "Rule",
          relationship: `${r.properties.direction} ${r.properties.access}`,
          detail: `${r.properties.sourceAddressPrefix ?? "*"} → ${r.properties.destinationPortRange ?? "*"} (${r.properties.protocol})`,
        });
      });
    }
  }

  const iconFor = (t: string) => {
    if (t.includes("NIC")) return <Network className="h-3.5 w-3.5" />;
    if (t.includes("NSG")) return <Shield className="h-3.5 w-3.5" />;
    if (t.includes("Disk")) return <HardDrive className="h-3.5 w-3.5" />;
    if (t.includes("Subnet") || t.includes("VNet")) return <Layers className="h-3.5 w-3.5" />;
    return <Server className="h-3.5 w-3.5" />;
  };

  const columns: DataColumn<Edge>[] = [
    {
      key: "type",
      header: "Type",
      accessor: (r) => r.type,
      cell: (r) => (
        <div className="flex items-center gap-1.5">
          {iconFor(r.type)}
          <span className="font-medium">{r.type}</span>
        </div>
      ),
    },
    {
      key: "resource",
      header: "Resource",
      accessor: (r) => r.resource,
      cell: (r) => <span className="font-mono text-xs">{r.resource}</span>,
    },
    { key: "rel", header: "Relationship", accessor: (r) => r.relationship },
    { key: "detail", header: "Detail", accessor: (r) => r.detail },
  ];

  const disksCount = edges.filter((e) => e.type.includes("Disk")).length;
  const hasPip = edges.some((e) => e.type === "Public IP");
  const hasNsg = edges.some((e) => e.type.includes("NSG"));

  if (!activeId) return <NoSubscriptionState />;

  const loading =
    vms.isLoading ||
    nics.isLoading ||
    nsgs.isLoading ||
    pips.isLoading ||
    disks.isLoading ||
    vnets.isLoading;

  return (
    <>
      <PageHeader
        icon={<Bomb className="h-5 w-5" />}
        title="Blast Radius Analyzer"
        description={`Every resource connected to a selected VM, VNet, or NSG in ${activeName ?? "this subscription"}.`}
        actions={
          selectedName ? (
            <ExportButtons
              filenameBase={`blast_radius_${selectedName}`}
              title={`Blast Radius: ${selectedName}`}
              rows={edges}
              columns={[
                { header: "Type", accessor: (r) => r.type },
                { header: "Resource", accessor: (r) => r.resource },
                { header: "Relationship", accessor: (r) => r.relationship },
                { header: "Detail", accessor: (r) => r.detail },
              ]}
            />
          ) : null
        }
      />

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Target</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          <Select value={resourceType} onValueChange={(v: "vm" | "vnet" | "nsg") => setResourceType(v)}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="vm">Virtual Machine</SelectItem>
              <SelectItem value="vnet">Virtual Network</SelectItem>
              <SelectItem value="nsg">Network Security Group</SelectItem>
            </SelectContent>
          </Select>
          <Select value={selectedName} onValueChange={setSelectedName}>
            <SelectTrigger className="w-72">
              <SelectValue placeholder={loading ? "Loading…" : "Select resource"} />
            </SelectTrigger>
            <SelectContent>
              {options.map((n) => (
                <SelectItem key={n} value={n}>
                  {n}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {selectedName && (
        <>
          <div className="rounded-lg border bg-card p-4">
            <div className="flex items-center gap-2">
              {icon}
              <span className="font-semibold">{selectedName}</span>
            </div>
            {selectedInfo && (
              <p className="mt-1 text-xs text-muted-foreground">{selectedInfo}</p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <StatCard label="Connected resources" value={edges.length} />
            <StatCard label="Disks affected" value={disksCount} />
            <StatCard
              label="Public exposure"
              value={hasPip ? "Yes" : "No"}
              deltaTone={hasPip ? "negative" : "positive"}
              delta={hasPip ? "Internet-facing" : "Internal only"}
            />
            <StatCard
              label="NSG protection"
              value={hasNsg ? "Yes" : "No"}
              deltaTone={hasNsg ? "positive" : "negative"}
              delta={hasNsg ? "Rules active" : "Unprotected"}
            />
          </div>

          {resourceType === "vm" && (
            <Alert variant={hasPip ? "destructive" : hasNsg ? "success" : "warning"}>
              <AlertTitle>Impact assessment</AlertTitle>
              <AlertDescription>
                If <strong>{selectedName}</strong> goes down: {disksCount} disk
                {disksCount === 1 ? "" : "s"} become inaccessible.{" "}
                {hasPip
                  ? "External traffic to the public IP is affected."
                  : "No public IP — internal only."}{" "}
                {hasNsg
                  ? "NSG rules still protect the subnet."
                  : "⚠ No NSG detected on the NIC."}
              </AlertDescription>
            </Alert>
          )}

          <DataTable
            rows={edges}
            columns={columns}
            isLoading={loading}
            searchPlaceholder="Filter connected resources…"
            emptyMessage="No connected resources detected."
            getRowId={(r, i) => `${r.type}-${r.resource}-${i}`}
          />
        </>
      )}
    </>
  );
}
