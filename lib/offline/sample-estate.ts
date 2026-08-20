/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Synthetic sample estate for the instant "no-login" demo. Generated fresh on
 * each demo entry (randomised but always internally consistent) and shaped as
 * a resolved ARM resource list, so it flows through the real file parser and
 * lights up topology, path tracing, NSG/WAF, IPAM, inventory, RBAC and certs.
 *
 * Everything here is fictional. It never touches Azure and nothing leaves the
 * browser.
 */

import { parseInfraFile } from "./parse";
import type { ParsedEstate } from "./estate";

const SUB = "11111111-1111-1111-1111-111111111111";
const rid = (rg: string, type: string, name: string) =>
  `/subscriptions/${SUB}/resourceGroups/${rg}/providers/${type}/${name}`;
const roleDefId = (guid: string) => `/subscriptions/${SUB}/providers/Microsoft.Authorization/roleDefinitions/${guid}`;

const OWNER = "8e3af657-a8ff-443c-a75c-2fe8c4bcb635";
const CONTRIB = "b24988ac-6180-42a0-ab88-20f7382dd24c";
const READER = "acdd72a7-3385-48ef-bd42-f606fba81ae7";
const UAA = "18d7d88d-d35e-4fb5-a5c3-7773c20a72d9";

const pick = <T>(a: T[]): T => a[Math.floor(Math.random() * a.length)];
const rint = (lo: number, hi: number) => Math.floor(Math.random() * (hi - lo + 1)) + lo;
const chance = (p: number) => Math.random() < p;
const iso = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString();

function guid(): string {
  try {
    if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  } catch {
    /* fall through */
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function rule(
  name: string,
  priority: number,
  direction: "Inbound" | "Outbound",
  access: "Allow" | "Deny",
  source: string,
  ports: string,
) {
  return {
    name,
    properties: { priority, direction, access, protocol: "Tcp", sourceAddressPrefix: source, destinationAddressPrefix: "*", destinationPortRange: ports },
  };
}

const COMPANIES = ["Contoso", "Fabrikam", "Northwind", "Adventure Works", "Tailspin", "Wingtip", "Proseware", "Litware"];
const REGIONS = ["eastus", "westeurope", "centralindia", "uksouth", "southeastasia"];

function generate(): { value: any[]; company: string } {
  const company = pick(COMPANIES);
  const slug = company.toLowerCase().replace(/[^a-z0-9]/g, "");
  const region = pick(REGIONS);
  const resources: any[] = [];

  const a = rint(0, 40);
  const b = (a + rint(3, 20)) % 60;
  const prodRg = `rg-${slug}-prod`;
  const hubRg = `rg-${slug}-hub`;
  const VNET_PROD = rid(prodRg, "Microsoft.Network/virtualNetworks", `vnet-${slug}-prod`);
  const VNET_HUB = rid(hubRg, "Microsoft.Network/virtualNetworks", `vnet-${slug}-hub`);
  const nsgId = (rg: string, n: string) => rid(rg, "Microsoft.Network/networkSecurityGroups", n);
  const rtId = rid(prodRg, "Microsoft.Network/routeTables", `rt-${slug}-prod`);

  // --- NSGs (guaranteed mix of green / amber / red) ---
  const exposeSsh = chance(0.7);
  const hasBastion = chance(0.8);
  const hubOpen = chance(0.55);
  const dbPort = pick(["1433", "3306", "6379", "5432"]);

  const webRules = [rule("allow-https", 100, "Inbound", "Allow", "Internet", "443")];
  if (chance(0.8)) webRules.push(rule("allow-http", 110, "Inbound", "Allow", "Internet", "80"));
  if (exposeSsh) webRules.push(rule("ssh-mgmt", 120, "Inbound", "Allow", "Internet", "22"));
  // Ensure at least one internet-open critical path exists somewhere.
  if (!exposeSsh && !hasBastion && !hubOpen) webRules.push(rule("ssh-mgmt", 120, "Inbound", "Allow", "Internet", "22"));

  resources.push(
    { id: nsgId(prodRg, "nsg-web"), name: "nsg-web", type: "Microsoft.Network/networkSecurityGroups", location: region, properties: { securityRules: webRules } },
    {
      id: nsgId(prodRg, "nsg-app"),
      name: "nsg-app",
      type: "Microsoft.Network/networkSecurityGroups",
      location: region,
      properties: {
        securityRules: [
          rule("from-web-https", 100, "Inbound", "Allow", `10.${a}.1.0/24`, "443"),
          rule("from-web-app", 110, "Inbound", "Allow", `10.${a}.1.0/24`, "8080"),
        ],
      },
    },
    {
      id: nsgId(prodRg, "nsg-data"),
      name: "nsg-data",
      type: "Microsoft.Network/networkSecurityGroups",
      location: region,
      properties: { securityRules: [rule("db-from-app", 100, "Inbound", "Allow", `10.${a}.2.0/24`, dbPort)] },
    },
  );
  if (hasBastion) {
    resources.push({
      id: nsgId(prodRg, "nsg-bastion"),
      name: "nsg-bastion",
      type: "Microsoft.Network/networkSecurityGroups",
      location: region,
      properties: {
        securityRules: [
          rule("rdp-internet", 100, "Inbound", "Allow", "Internet", "3389"),
          rule("ssh-vnet", 110, "Inbound", "Allow", "VirtualNetwork", "22"),
        ],
      },
    });
  }
  resources.push({
    id: nsgId(hubRg, "nsg-shared"),
    name: "nsg-shared",
    type: "Microsoft.Network/networkSecurityGroups",
    location: region,
    properties: {
      securityRules: [hubOpen ? rule("allow-all", 100, "Inbound", "Allow", "VirtualNetwork", "*") : rule("allow-mgmt", 100, "Inbound", "Allow", "VirtualNetwork", "443")],
    },
  });

  // --- Prod VNet + subnets ---
  const subnetDefs = [
    { name: "snet-web", cidr: `10.${a}.1.0/24`, nsg: "nsg-web" },
    { name: "snet-app", cidr: `10.${a}.2.0/24`, nsg: "nsg-app", rt: true },
    { name: "snet-data", cidr: `10.${a}.3.0/24`, nsg: "nsg-data", rt: true },
    ...(hasBastion ? [{ name: "snet-bastion", cidr: `10.${a}.4.0/24`, nsg: "nsg-bastion" }] : []),
    { name: "GatewaySubnet", cidr: `10.${a}.255.0/27` },
  ];
  resources.push({
    id: VNET_PROD,
    name: `vnet-${slug}-prod`,
    type: "Microsoft.Network/virtualNetworks",
    location: region,
    properties: {
      addressSpace: { addressPrefixes: [`10.${a}.0.0/16`] },
      subnets: subnetDefs.map((s: any) => ({
        id: `${VNET_PROD}/subnets/${s.name}`,
        name: s.name,
        properties: {
          addressPrefix: s.cidr,
          ...(s.nsg ? { networkSecurityGroup: { id: nsgId(prodRg, s.nsg) } } : {}),
          ...(s.rt ? { routeTable: { id: rtId } } : {}),
        },
      })),
      virtualNetworkPeerings: [
        { name: "prod-to-hub", properties: { remoteVirtualNetwork: { id: VNET_HUB }, allowGatewayTransit: false, useRemoteGateways: true, peeringState: "Connected" } },
      ],
    },
  });

  // --- Hub VNet ---
  resources.push({
    id: VNET_HUB,
    name: `vnet-${slug}-hub`,
    type: "Microsoft.Network/virtualNetworks",
    location: region,
    properties: {
      addressSpace: { addressPrefixes: [`10.${b}.0.0/16`] },
      subnets: [
        { id: `${VNET_HUB}/subnets/AzureFirewallSubnet`, name: "AzureFirewallSubnet", properties: { addressPrefix: `10.${b}.0.0/26` } },
        { id: `${VNET_HUB}/subnets/snet-shared`, name: "snet-shared", properties: { addressPrefix: `10.${b}.1.0/24`, networkSecurityGroup: { id: nsgId(hubRg, "nsg-shared") } } },
      ],
      virtualNetworkPeerings: [
        { name: "hub-to-prod", properties: { remoteVirtualNetwork: { id: VNET_PROD }, allowGatewayTransit: true, useRemoteGateways: false, peeringState: "Connected" } },
      ],
    },
  });

  // --- Route table ---
  resources.push({
    id: rtId,
    name: `rt-${slug}-prod`,
    type: "Microsoft.Network/routeTables",
    location: region,
    properties: { routes: [{ name: "default-via-fw", properties: { addressPrefix: "0.0.0.0/0", nextHopType: "VirtualAppliance", nextHopIpAddress: `10.${b}.0.4` } }] },
  });

  // --- ExpressRoute circuits (hub connectivity) ---
  const erProviders: [string, string][] = [
    ["Equinix", "Silicon Valley"],
    ["Equinix", "Washington DC"],
    ["Megaport", "Amsterdam"],
    ["Colt", "London"],
    ["AT&T", "Dallas"],
    ["Orange", "Paris"],
  ];
  const erBandwidths = [100, 200, 500, 1000, 2000, 5000];
  const addCircuit = (cname: string, provisioned: boolean) => {
    const [prov, loc] = pick(erProviders);
    const bw = pick(erBandwidths);
    const tier = bw >= 1000 && chance(0.6) ? "Premium" : "Standard";
    const peering = (peeringType: string) => ({
      name: peeringType,
      properties: {
        peeringType,
        state: "Enabled",
        azureASN: 12076,
        peerASN: rint(64512, 65534),
        vlanId: rint(100, 999),
      },
    });
    resources.push({
      id: rid(hubRg, "Microsoft.Network/expressRouteCircuits", cname),
      name: cname,
      type: "Microsoft.Network/expressRouteCircuits",
      location: region,
      sku: { name: `${tier}_MeteredData`, tier, family: "MeteredData" },
      properties: {
        circuitProvisioningState: "Enabled",
        serviceProviderProvisioningState: provisioned ? "Provisioned" : "NotProvisioned",
        provisioningState: "Succeeded",
        allowClassicOperations: false,
        serviceKey: guid(),
        serviceProviderProperties: { serviceProviderName: prov, peeringLocation: loc, bandwidthInMbps: bw },
        peerings: provisioned
          ? [peering("AzurePrivatePeering"), ...(chance(0.5) ? [peering("MicrosoftPeering")] : [])]
          : [],
      },
    });
  };
  addCircuit(`er-${slug}-primary`, true);
  if (chance(0.5)) addCircuit(`er-${slug}-dr`, false);

  // --- Virtual network gateways (VPN + optional ExpressRoute) ---
  const useBasicGw = chance(0.3);
  const gwSku = useBasicGw ? "Basic" : pick(["VpnGw1", "VpnGw2", "VpnGw2AZ", "VpnGw3"]);
  resources.push({
    id: rid(hubRg, "Microsoft.Network/virtualNetworkGateways", `vpngw-${slug}`),
    name: `vpngw-${slug}`,
    type: "Microsoft.Network/virtualNetworkGateways",
    location: region,
    properties: {
      gatewayType: "Vpn",
      vpnType: chance(0.2) ? "PolicyBased" : "RouteBased",
      vpnGatewayGeneration: useBasicGw ? "None" : pick(["Generation1", "Generation2"]),
      enableBgp: chance(0.5),
      activeActive: chance(0.4),
      sku: { name: gwSku, tier: gwSku },
      provisioningState: "Succeeded",
    },
  });
  if (chance(0.5)) {
    resources.push({
      id: rid(hubRg, "Microsoft.Network/virtualNetworkGateways", `ergw-${slug}`),
      name: `ergw-${slug}`,
      type: "Microsoft.Network/virtualNetworkGateways",
      location: region,
      properties: {
        gatewayType: "ExpressRoute",
        vpnType: "RouteBased",
        activeActive: false,
        sku: { name: "ErGw1AZ", tier: "ErGw1AZ" },
        provisioningState: "Succeeded",
      },
    });
  }

  // --- Load balancers (Standard public + occasional Basic/internal, some empty pools) ---
  const lbBackend = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `becfg-${i}` }));
  resources.push({
    id: rid(prodRg, "Microsoft.Network/loadBalancers", `lb-${slug}-pub`),
    name: `lb-${slug}-pub`,
    type: "Microsoft.Network/loadBalancers",
    location: region,
    sku: { name: "Standard", tier: "Regional" },
    properties: {
      frontendIPConfigurations: [
        { name: "fe-public", properties: { publicIPAddress: { id: rid(prodRg, "Microsoft.Network/publicIPAddresses", "pip-agw") } } },
      ],
      backendAddressPools: [{ name: "bepool", properties: { backendIPConfigurations: lbBackend(rint(1, 3)) } }],
      loadBalancingRules: [{ name: "https" }, { name: "http" }],
      probes: [{ name: "hp" }],
    },
  });
  if (chance(0.6)) {
    const emptyPool = chance(0.5);
    resources.push({
      id: rid(prodRg, "Microsoft.Network/loadBalancers", `lb-${slug}-int`),
      name: `lb-${slug}-int`,
      type: "Microsoft.Network/loadBalancers",
      location: region,
      sku: { name: chance(0.5) ? "Basic" : "Standard" },
      properties: {
        frontendIPConfigurations: [
          { name: "fe-internal", properties: { privateIPAddress: `10.${a}.2.250`, subnet: { id: `${VNET_PROD}/subnets/snet-app` } } },
        ],
        backendAddressPools: [{ name: "bepool", properties: { backendIPConfigurations: emptyPool ? [] : lbBackend(2) } }],
        loadBalancingRules: emptyPool ? [] : [{ name: "app" }],
      },
    });
  }

  // --- Azure Firewall (hub) ---
  const fwPolicy = chance(0.6);
  resources.push({
    id: rid(hubRg, "Microsoft.Network/azureFirewalls", `afw-${slug}`),
    name: `afw-${slug}`,
    type: "Microsoft.Network/azureFirewalls",
    location: region,
    ...(chance(0.5) ? { zones: ["1", "2", "3"] } : {}),
    sku: { name: "AZFW_VNet", tier: pick(["Standard", "Standard", "Premium"]) },
    properties: {
      threatIntelMode: pick(["Deny", "Deny", "Alert", "Off"]),
      ...(fwPolicy ? { firewallPolicy: { id: rid(hubRg, "Microsoft.Network/firewallPolicies", `afwp-${slug}`) } } : {}),
      ipConfigurations: [
        { name: "fw-ipconfig", properties: { publicIPAddress: { id: rid(hubRg, "Microsoft.Network/publicIPAddresses", "pip-fw") } } },
      ],
      provisioningState: "Succeeded",
    },
  });

  // --- Cosmos DB ---
  if (chance(0.85)) {
    const mongo = chance(0.4);
    const multiRegion = chance(0.4);
    const locs = multiRegion
      ? [
          { locationName: region, failoverPriority: 0, isZoneRedundant: chance(0.5) },
          { locationName: pick(REGIONS.filter((r) => r !== region)), failoverPriority: 1, isZoneRedundant: false },
        ]
      : [{ locationName: region, failoverPriority: 0, isZoneRedundant: false }];
    resources.push({
      id: rid(prodRg, "Microsoft.DocumentDB/databaseAccounts", `cosmos-${slug}`),
      name: `cosmos-${slug}`,
      type: "Microsoft.DocumentDB/databaseAccounts",
      location: region,
      kind: mongo ? "MongoDB" : "GlobalDocumentDB",
      properties: {
        documentEndpoint: `https://cosmos-${slug}.documents.azure.com:443/`,
        publicNetworkAccess: chance(0.6) ? "Enabled" : "Disabled",
        enableAutomaticFailover: multiRegion ? chance(0.6) : false,
        enableMultipleWriteLocations: multiRegion ? chance(0.5) : false,
        enableFreeTier: chance(0.2),
        consistencyPolicy: { defaultConsistencyLevel: pick(["Session", "Session", "BoundedStaleness", "Strong", "Eventual"]) },
        capabilities: mongo ? [{ name: "EnableMongo" }] : [],
        backupPolicy: { type: "Periodic" },
        locations: locs,
        databaseAccountOfferType: "Standard",
      },
    });
  }

  // --- AKS cluster ---
  if (chance(0.8)) {
    const priv = chance(0.4);
    const aad = chance(0.6);
    const k8s = pick(["1.27.9", "1.28.5", "1.29.4", "1.30.2"]);
    resources.push({
      id: rid(prodRg, "Microsoft.ContainerService/managedClusters", `aks-${slug}`),
      name: `aks-${slug}`,
      type: "Microsoft.ContainerService/managedClusters",
      location: region,
      sku: { name: "Base", tier: chance(0.5) ? "Standard" : "Free" },
      properties: {
        kubernetesVersion: k8s,
        currentKubernetesVersion: k8s,
        dnsPrefix: `aks-${slug}`,
        fqdn: `aks-${slug}.hcp.${region}.azmk8s.io`,
        enableRBAC: true,
        disableLocalAccounts: aad ? chance(0.6) : false,
        apiServerAccessProfile: { enablePrivateCluster: priv },
        aadProfile: aad ? { managed: true, enableAzureRBAC: chance(0.6) } : null,
        networkProfile: { networkPlugin: pick(["azure", "kubenet"]), loadBalancerSku: "standard" },
        agentPoolProfiles: [
          { name: "systempool", count: rint(2, 3), vmSize: "Standard_D4s_v5", mode: "System", osType: "Linux", enableAutoScaling: true, minCount: 2, maxCount: 5 },
          ...(chance(0.5) ? [{ name: "userpool", count: rint(1, 4), vmSize: "Standard_D8s_v5", mode: "User", osType: "Linux" }] : []),
        ],
        provisioningState: "Succeeded",
      },
    });
  }

  // --- Front Door (classic) — some endpoints intentionally miss a WAF policy ---
  if (chance(0.7)) {
    const epCount = rint(1, 2);
    const wafPolicyId = rid(prodRg, "Microsoft.Network/frontdoorWebApplicationFirewallPolicies", `wafp${slug}`);
    const endpoints = Array.from({ length: epCount }, (_, i) => ({
      name: `fe-${slug}-${i}`,
      properties: {
        hostName: `${slug}${i}.azurefd.net`,
        ...(chance(0.5) ? { webApplicationFirewallPolicyLink: { id: wafPolicyId } } : {}),
      },
    }));
    resources.push({
      id: rid(prodRg, "Microsoft.Network/frontdoors", `fd-${slug}`),
      name: `fd-${slug}`,
      type: "Microsoft.Network/frontdoors",
      location: "global",
      properties: {
        enabledState: "Enabled",
        frontendEndpoints: endpoints,
        backendPools: [{ name: "bepool", properties: { backends: [{}, {}] } }],
        routingRules: [{ name: "rule1", properties: { enabledState: "Enabled" } }],
      },
    });
  }

  // --- VMs + NICs (+ some public IPs) — enables path tracing ---
  const tiers = [
    { sub: "snet-web", p: "web", octet: 1 },
    { sub: "snet-app", p: "app", octet: 2 },
    { sub: "snet-data", p: "data", octet: 3 },
  ];
  const vmCount = rint(3, 7);
  const pubIps: any[] = [];
  for (let i = 0; i < vmCount; i++) {
    const tier = tiers[i % tiers.length];
    const n = String(Math.floor(i / tiers.length) + 1).padStart(2, "0");
    const vmName = `vm-${tier.p}${n}`;
    const nicName = `nic-${tier.p}${n}`;
    const privateIp = `10.${a}.${tier.octet}.${4 + i}`;
    const givePip = tier.p === "web" && chance(0.7);
    const pipName = `pip-${vmName}`;
    if (givePip) {
      pubIps.push({
        id: rid(prodRg, "Microsoft.Network/publicIPAddresses", pipName),
        name: pipName,
        type: "Microsoft.Network/publicIPAddresses",
        location: region,
        sku: { name: "Standard" },
        properties: { ipAddress: `20.${rint(1, 254)}.${rint(1, 254)}.${rint(1, 254)}`, publicIPAllocationMethod: "Static" },
      });
    }
    resources.push({
      id: rid(prodRg, "Microsoft.Compute/virtualMachines", vmName),
      name: vmName,
      type: "Microsoft.Compute/virtualMachines",
      location: region,
      properties: {
        hardwareProfile: { vmSize: pick(["Standard_D2s_v5", "Standard_D4s_v5", "Standard_D8s_v5", "Standard_E4s_v5", "Standard_B2ms"]) },
        storageProfile: { osDisk: { osType: chance(0.5) ? "Linux" : "Windows" }, imageReference: { publisher: "Canonical", offer: "0001-com-ubuntu-server-jammy", sku: "22_04-lts" } },
        networkProfile: { networkInterfaces: [{ id: rid(prodRg, "Microsoft.Network/networkInterfaces", nicName) }] },
      },
      tags: { env: "prod", app: tier.p },
    });
    resources.push({
      id: rid(prodRg, "Microsoft.Network/networkInterfaces", nicName),
      name: nicName,
      type: "Microsoft.Network/networkInterfaces",
      location: region,
      properties: {
        ipConfigurations: [
          {
            name: "ipconfig1",
            properties: {
              privateIPAddress: privateIp,
              subnet: { id: `${VNET_PROD}/subnets/${tier.sub}` },
              ...(givePip ? { publicIPAddress: { id: rid(prodRg, "Microsoft.Network/publicIPAddresses", pipName) } } : {}),
            },
          },
        ],
      },
    });
  }
  resources.push(...pubIps);
  resources.push({
    id: rid(prodRg, "Microsoft.Network/publicIPAddresses", "pip-agw"),
    name: "pip-agw",
    type: "Microsoft.Network/publicIPAddresses",
    location: region,
    sku: { name: "Standard" },
    properties: { ipAddress: `20.${rint(1, 254)}.${rint(1, 254)}.${rint(1, 254)}`, publicIPAllocationMethod: "Static" },
  });

  // --- Storage (at least one with public blob access) ---
  const storeCount = rint(1, 3);
  for (let i = 0; i < storeCount; i++) {
    const sname = `st${slug}${i}${rint(100, 999)}`;
    resources.push({
      id: rid(prodRg, "Microsoft.Storage/storageAccounts", sname),
      name: sname,
      type: "Microsoft.Storage/storageAccounts",
      location: region,
      kind: "StorageV2",
      sku: { name: pick(["Standard_LRS", "Standard_GRS"]) },
      properties: { supportsHttpsTrafficOnly: chance(0.85), allowBlobPublicAccess: i === 0 ? true : chance(0.3), minimumTlsVersion: "TLS1_2" },
      tags: { env: "prod" },
    });
  }

  // --- SQL ---
  if (chance(0.85)) {
    resources.push({
      id: rid(prodRg, "Microsoft.Sql/servers", `sql-${slug}`),
      name: `sql-${slug}`,
      type: "Microsoft.Sql/servers",
      location: region,
      properties: { fullyQualifiedDomainName: `sql-${slug}.database.windows.net`, administratorLogin: "sqladmin", minimalTlsVersion: "1.2", publicNetworkAccess: chance(0.6) ? "Enabled" : "Disabled" },
    });
  }

  // --- Key Vault ---
  resources.push({
    id: rid(prodRg, "Microsoft.KeyVault/vaults", `kv-${slug}`),
    name: `kv-${slug}`,
    type: "Microsoft.KeyVault/vaults",
    location: region,
    properties: { enableSoftDelete: true, enableRbacAuthorization: chance(0.7), publicNetworkAccess: chance(0.5) ? "Enabled" : "Disabled", sku: { name: "standard" } },
  });

  // --- Application Gateway (WAF) ---
  resources.push({
    id: rid(prodRg, "Microsoft.Network/applicationGateways", `agw-${slug}`),
    name: `agw-${slug}`,
    type: "Microsoft.Network/applicationGateways",
    location: region,
    properties: { sku: { name: "WAF_v2", tier: "WAF_v2" }, webApplicationFirewallConfiguration: { enabled: true, firewallMode: pick(["Prevention", "Detection"]), ruleSetVersion: "3.2" } },
  });

  // --- App Services ---
  const appCount = rint(1, 3);
  for (let i = 0; i < appCount; i++) {
    const n = `app-${slug}-${pick(["web", "api", "fn", "portal"])}${i}`;
    resources.push({
      id: rid(prodRg, "Microsoft.Web/sites", n),
      name: n,
      type: "Microsoft.Web/sites",
      location: region,
      kind: "app",
      properties: { httpsOnly: chance(0.7), defaultHostName: `${n}.azurewebsites.net`, state: "Running" },
      tags: { env: "prod" },
    });
  }

  // --- Certificates (guaranteed expired + expiring-soon + healthy) ---
  const certExp = [rint(-30, -1), rint(5, 29), rint(120, 340)];
  ["portal", "api", "www"].forEach((h, i) => {
    resources.push({
      id: rid(prodRg, "Microsoft.Web/certificates", `cert-${h}-${slug}`),
      name: `cert-${h}-${slug}`,
      type: "Microsoft.Web/certificates",
      location: region,
      properties: {
        subjectName: `${h}.${slug}.com`,
        hostNames: [`${h}.${slug}.com`],
        issueDate: iso(-365),
        expirationDate: iso(certExp[i]),
        thumbprint: guid().replace(/-/g, "").toUpperCase(),
      },
    });
  });

  // --- RBAC ---
  resources.push(
    ...([[OWNER, "Owner"], [CONTRIB, "Contributor"], [READER, "Reader"], [UAA, "User Access Administrator"]] as [string, string][]).map(
      ([g, roleName]) => ({ id: roleDefId(g), name: g, type: "Microsoft.Authorization/roleDefinitions", properties: { roleName, type: "BuiltInRole" } }),
    ),
  );
  const ptypes = ["User", "ServicePrincipal", "Group"];
  const scopes = [`/subscriptions/${SUB}`, `/subscriptions/${SUB}/resourceGroups/${prodRg}`, `/subscriptions/${SUB}/resourceGroups/${hubRg}`];
  const addAssignment = (def: string) => {
    resources.push({
      id: `/subscriptions/${SUB}/providers/Microsoft.Authorization/roleAssignments/${guid()}`,
      name: guid(),
      type: "Microsoft.Authorization/roleAssignments",
      properties: { roleDefinitionId: roleDefId(def), principalId: guid(), principalType: pick(ptypes), scope: pick(scopes) },
    });
  };
  for (let i = 0; i < rint(2, 3); i++) addAssignment(OWNER);
  if (chance(0.6)) addAssignment(UAA);
  for (let i = 0; i < rint(1, 4); i++) addAssignment(CONTRIB);
  for (let i = 0; i < rint(2, 5); i++) addAssignment(READER);

  return { value: resources, company };
}

/** Build a fresh, randomised demo estate by running the real file parser. */
export function buildSampleEstate(): ParsedEstate {
  const { value, company } = generate();
  const estate = parseInfraFile("Sample estate.json", JSON.stringify({ value }), Date.now());
  estate.subscriptionName = `${company} · sample estate (demo)`;
  estate.demo = true;
  return estate;
}
