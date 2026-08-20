/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Parse an uploaded infrastructure file into a ParsedEstate.
 *
 * Supported inputs:
 *   - Terraform state  (`.tfstate`, or `terraform show -json` output)
 *   - Azure ARM JSON   (a resolved resource list from `az resource list` /
 *                        an ARM REST list `{value:[…]}`, an exported template,
 *                        or a single resource GET)
 *
 * Output resources are shaped exactly like the Azure ARM REST responses the
 * pages already consume (camelCase, nested `properties`), so no page needs to
 * change. Terraform state is the most reliable input because it stores fully
 * resolved attributes (including real ARM resource ids); raw ARM templates with
 * `[parameters()]`/`[resourceId()]` expressions are handled best-effort.
 *
 * Pure, in-browser transformation. No network, no writes.
 */

import {
  OFFLINE_SUBSCRIPTION_ID,
  type EstateSummaryRow,
  type ParsedEstate,
} from "./estate";

const TYPE_LABELS: Record<string, string> = {
  "microsoft.network/virtualnetworks": "Virtual networks",
  "microsoft.network/networksecuritygroups": "Network security groups",
  "microsoft.network/routetables": "Route tables",
  "microsoft.network/networkinterfaces": "Network interfaces",
  "microsoft.network/publicipaddresses": "Public IP addresses",
  "microsoft.network/applicationgateways": "Application gateways",
  "microsoft.network/expressroutecircuits": "ExpressRoute circuits",
  "microsoft.network/loadbalancers": "Load balancers",
  "microsoft.network/virtualnetworkgateways": "Virtual network gateways",
  "microsoft.network/azurefirewalls": "Azure Firewalls",
  "microsoft.network/frontdoors": "Front Door",
  "microsoft.compute/virtualmachines": "Virtual machines",
  "microsoft.storage/storageaccounts": "Storage accounts",
  "microsoft.sql/servers": "SQL servers",
  "microsoft.documentdb/databaseaccounts": "Cosmos DB accounts",
  "microsoft.containerservice/managedclusters": "AKS clusters",
  "microsoft.keyvault/vaults": "Key vaults",
  "microsoft.web/sites": "App Services",
  "microsoft.web/certificates": "Certificates",
  "microsoft.authorization/roleassignments": "Role assignments",
  "microsoft.authorization/roledefinitions": "Role definitions",
  resourcegroups: "Resource groups",
};

/* ---------------- small helpers ---------------- */

const asArray = <T = any>(v: any): T[] => (Array.isArray(v) ? v : []);
const num = (v: any): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
const lc = (s: string) => s.toLowerCase();

function subId(rg: string, type: string, name: string): string {
  return `/subscriptions/${OFFLINE_SUBSCRIPTION_ID}/resourceGroups/${rg}/providers/${type}/${name}`;
}

/* ================================================================
 * Terraform state
 * ================================================================ */

interface TfRes {
  type: string;
  attributes: any;
}

/** Collect {type, attributes} from both `.tfstate` and `terraform show -json`. */
function collectTfResources(root: any): TfRes[] {
  const out: TfRes[] = [];

  // State format: root.resources[].instances[].attributes
  if (Array.isArray(root.resources) && root.resources.some((r: any) => r?.instances)) {
    for (const r of root.resources) {
      if (typeof r?.type !== "string") continue;
      for (const inst of asArray(r.instances)) {
        if (inst?.attributes) out.push({ type: r.type, attributes: inst.attributes });
      }
    }
  }

  // show -json format: root.values.root_module{.resources, .child_modules[]}
  const rootModule = root?.values?.root_module;
  if (rootModule) {
    const walk = (mod: any) => {
      for (const r of asArray(mod.resources)) {
        if (typeof r?.type === "string" && r.values) out.push({ type: r.type, attributes: r.values });
      }
      for (const child of asArray(mod.child_modules)) walk(child);
    };
    walk(rootModule);
  }

  // Bare state without instances (older) — resources[] with .primary.attributes
  if (out.length === 0 && Array.isArray(root.resources)) {
    for (const r of root.resources) {
      if (typeof r?.type === "string" && r?.primary?.attributes) {
        out.push({ type: r.type, attributes: r.primary.attributes });
      }
    }
  }

  return out;
}

function mapNsgRule(r: any) {
  const p: any = {
    priority: num(r.priority),
    direction: r.direction,
    access: r.access,
    protocol: r.protocol,
  };
  if (r.source_address_prefix) p.sourceAddressPrefix = r.source_address_prefix;
  if (asArray(r.source_address_prefixes).length) p.sourceAddressPrefixes = r.source_address_prefixes;
  if (r.destination_address_prefix) p.destinationAddressPrefix = r.destination_address_prefix;
  if (r.destination_port_range) p.destinationPortRange = r.destination_port_range;
  if (asArray(r.destination_port_ranges).length) p.destinationPortRanges = r.destination_port_ranges;
  if (r.source_port_range) p.sourcePortRange = r.source_port_range;
  return { name: r.name, properties: p };
}

function mapRoute(r: any) {
  const p: any = { addressPrefix: r.address_prefix, nextHopType: r.next_hop_type };
  if (r.next_hop_in_ip_address) p.nextHopIpAddress = r.next_hop_in_ip_address;
  return { name: r.name, properties: p };
}

function parseTfstate(root: any): Record<string, unknown[]> {
  const res = collectTfResources(root);
  const byTfType = new Map<string, any[]>();
  for (const r of res) {
    if (!byTfType.has(r.type)) byTfType.set(r.type, []);
    byTfType.get(r.type)!.push(r.attributes);
  }
  const get = (t: string): any[] => byTfType.get(t) ?? [];

  // --- association + standalone maps ---
  const subnetNsg = new Map<string, string>(); // subnetIdLower -> nsgId
  const subnetRt = new Map<string, string>(); // subnetIdLower -> rtId
  for (const a of get("azurerm_subnet_network_security_group_association")) {
    if (a.subnet_id && a.network_security_group_id) subnetNsg.set(lc(a.subnet_id), a.network_security_group_id);
  }
  for (const a of get("azurerm_subnet_route_table_association")) {
    if (a.subnet_id && a.route_table_id) subnetRt.set(lc(a.subnet_id), a.route_table_id);
  }

  // --- NSGs (inline + standalone rules) ---
  const nsgByKey = new Map<string, any>(); // `${rg}/${name}` lower -> arm nsg
  for (const a of get("azurerm_network_security_group")) {
    const rules = asArray(a.security_rule).map(mapNsgRule);
    const armNsg = {
      id: a.id || subId(a.resource_group_name, "Microsoft.Network/networkSecurityGroups", a.name),
      name: a.name,
      type: "Microsoft.Network/networkSecurityGroups",
      location: a.location,
      properties: { securityRules: rules },
    };
    nsgByKey.set(lc(`${a.resource_group_name}/${a.name}`), armNsg);
  }
  for (const a of get("azurerm_network_security_rule")) {
    const key = lc(`${a.resource_group_name}/${a.network_security_group_name}`);
    const nsg = nsgByKey.get(key);
    if (nsg) nsg.properties.securityRules.push(mapNsgRule(a));
  }

  // --- Route tables (inline + standalone routes) ---
  const rtByKey = new Map<string, any>();
  for (const a of get("azurerm_route_table")) {
    const routes = asArray(a.route).map(mapRoute);
    const armRt = {
      id: a.id || subId(a.resource_group_name, "Microsoft.Network/routeTables", a.name),
      name: a.name,
      type: "Microsoft.Network/routeTables",
      location: a.location,
      properties: { routes, subnets: [] as any[] },
    };
    rtByKey.set(lc(`${a.resource_group_name}/${a.name}`), armRt);
  }
  for (const a of get("azurerm_route")) {
    const rt = rtByKey.get(lc(`${a.resource_group_name}/${a.route_table_name}`));
    if (rt) rt.properties.routes.push(mapRoute(a));
  }
  const rtById = new Map<string, any>();
  for (const rt of rtByKey.values()) rtById.set(lc(rt.id), rt);

  // --- standalone subnets grouped for later attachment ---
  const standaloneSubnets = get("azurerm_subnet").map((a) => ({
    id: a.id || "",
    name: a.name,
    vnet: a.virtual_network_name,
    rg: a.resource_group_name,
    prefixes: asArray(a.address_prefixes).length ? a.address_prefixes : a.address_prefix ? [a.address_prefix] : [],
  }));

  // --- VNets ---
  const nsgById = new Map<string, any>();
  for (const nsg of nsgByKey.values()) nsgById.set(lc(nsg.id), nsg);

  const vnets: any[] = [];
  for (const a of get("azurerm_virtual_network")) {
    const vnetId = a.id || subId(a.resource_group_name, "Microsoft.Network/virtualNetworks", a.name);
    const vnetIdL = lc(vnetId);

    const subnets: any[] = [];
    const pushSubnet = (sName: string, sId: string, prefixes: string[], inlineNsg?: string) => {
      const sIdL = lc(sId);
      const nsgId = inlineNsg || subnetNsg.get(sIdL);
      const rtId = subnetRt.get(sIdL);
      const props: any = {};
      if (prefixes[0]) props.addressPrefix = prefixes[0];
      if (prefixes.length > 1) props.addressPrefixes = prefixes;
      if (nsgId) props.networkSecurityGroup = { id: nsgId };
      if (rtId) props.routeTable = { id: rtId };
      subnets.push({ id: sId, name: sName, properties: props });
      // Record reverse rt->subnet
      if (rtId && rtById.has(lc(rtId))) rtById.get(lc(rtId)).properties.subnets.push({ id: sId });
    };

    // inline subnet blocks on the VNet
    for (const s of asArray(a.subnet)) {
      const prefixes = asArray(s.address_prefixes).length ? s.address_prefixes : s.address_prefix ? [s.address_prefix] : [];
      pushSubnet(s.name, `${vnetId}/subnets/${s.name}`, prefixes, s.security_group);
    }
    // standalone azurerm_subnet belonging to this vnet
    for (const s of standaloneSubnets) {
      const belongs = (s.id && lc(s.id).startsWith(`${vnetIdL}/subnets/`)) || (s.vnet === a.name && s.rg === a.resource_group_name);
      if (belongs) pushSubnet(s.name, s.id || `${vnetId}/subnets/${s.name}`, s.prefixes);
    }

    // peerings
    const peerings = get("azurerm_virtual_network_peering")
      .filter((p) => p.virtual_network_name === a.name && p.resource_group_name === a.resource_group_name)
      .map((p) => ({
        name: p.name,
        properties: {
          remoteVirtualNetwork: { id: p.remote_virtual_network_id },
          allowGatewayTransit: Boolean(p.allow_gateway_transit),
          useRemoteGateways: Boolean(p.use_remote_gateways),
          allowForwardedTraffic: Boolean(p.allow_forwarded_traffic),
          peeringState: "Connected",
        },
      }));

    vnets.push({
      id: vnetId,
      name: a.name,
      type: "Microsoft.Network/virtualNetworks",
      location: a.location,
      properties: {
        addressSpace: { addressPrefixes: asArray(a.address_space) },
        subnets,
        virtualNetworkPeerings: peerings,
      },
    });
  }

  // --- Network interfaces (enables VM path tracing) ---
  const nicNsgAssoc = new Map<string, string>();
  for (const a of get("azurerm_network_interface_security_group_association")) {
    if (a.network_interface_id && a.network_security_group_id) {
      nicNsgAssoc.set(lc(a.network_interface_id), a.network_security_group_id);
    }
  }
  const nics = get("azurerm_network_interface").map((a) => {
    const nicId = a.id || subId(a.resource_group_name, "Microsoft.Network/networkInterfaces", a.name);
    const ipConfigurations = asArray(a.ip_configuration).map((ic: any) => {
      const props: any = {};
      if (ic.private_ip_address) props.privateIPAddress = ic.private_ip_address;
      if (ic.subnet_id) props.subnet = { id: ic.subnet_id };
      if (ic.public_ip_address_id) props.publicIPAddress = { id: ic.public_ip_address_id };
      return { name: ic.name, properties: props };
    });
    const nsgId = nicNsgAssoc.get(lc(nicId));
    return {
      id: nicId,
      name: a.name,
      type: "Microsoft.Network/networkInterfaces",
      location: a.location,
      properties: { ipConfigurations, ...(nsgId ? { networkSecurityGroup: { id: nsgId } } : {}) },
    };
  });

  // --- inventory (best-effort) ---
  const vms = [
    ...get("azurerm_linux_virtual_machine"),
    ...get("azurerm_windows_virtual_machine"),
    ...get("azurerm_virtual_machine"),
  ].map((a) => ({
    id: a.id || subId(a.resource_group_name, "Microsoft.Compute/virtualMachines", a.name),
    name: a.name,
    type: "Microsoft.Compute/virtualMachines",
    location: a.location,
    properties: {
      hardwareProfile: { vmSize: a.size || a.vm_size },
      networkProfile: {
        networkInterfaces: asArray(a.network_interface_ids).map((id: string) => ({ id })),
      },
    },
    tags: a.tags,
  }));

  const storage = get("azurerm_storage_account").map((a) => ({
    id: a.id || subId(a.resource_group_name, "Microsoft.Storage/storageAccounts", a.name),
    name: a.name,
    type: "Microsoft.Storage/storageAccounts",
    location: a.location,
    kind: a.account_kind || "StorageV2",
    sku: { name: `${a.account_tier || "Standard"}_${a.account_replication_type || "LRS"}` },
    properties: {
      supportsHttpsTrafficOnly:
        a.https_traffic_only_enabled ?? a.enable_https_traffic_only ?? true,
      allowBlobPublicAccess: a.allow_nested_items_to_be_public ?? a.allow_blob_public_access ?? false,
      minimumTlsVersion: a.min_tls_version || "TLS1_2",
    },
    tags: a.tags,
  }));

  const sql = [...get("azurerm_mssql_server"), ...get("azurerm_sql_server")].map((a) => ({
    id: a.id || subId(a.resource_group_name, "Microsoft.Sql/servers", a.name),
    name: a.name,
    type: "Microsoft.Sql/servers",
    location: a.location,
    properties: {
      fullyQualifiedDomainName: a.fully_qualified_domain_name,
      administratorLogin: a.administrator_login || a.administrator_login_name,
      minimalTlsVersion: a.minimum_tls_version,
      publicNetworkAccess: (a.public_network_access_enabled ?? true) ? "Enabled" : "Disabled",
    },
    tags: a.tags,
  }));

  const vaults = get("azurerm_key_vault").map((a) => ({
    id: a.id || subId(a.resource_group_name, "Microsoft.KeyVault/vaults", a.name),
    name: a.name,
    type: "Microsoft.KeyVault/vaults",
    location: a.location,
    properties: {
      enableSoftDelete: a.soft_delete_retention_days != null,
      enableRbacAuthorization: Boolean(a.enable_rbac_authorization),
      enabledForDeployment: Boolean(a.enabled_for_deployment),
      publicNetworkAccess: (a.public_network_access_enabled ?? true) ? "Enabled" : "Disabled",
      sku: { name: a.sku_name || "standard" },
    },
    tags: a.tags,
  }));

  const pips = get("azurerm_public_ip").map((a) => ({
    id: a.id || subId(a.resource_group_name, "Microsoft.Network/publicIPAddresses", a.name),
    name: a.name,
    type: "Microsoft.Network/publicIPAddresses",
    location: a.location,
    sku: { name: a.sku || "Basic" },
    properties: {
      ipAddress: a.ip_address,
      publicIPAllocationMethod: a.allocation_method,
    },
    tags: a.tags,
  }));

  const appgws = get("azurerm_application_gateway").map((a) => ({
    id: a.id || subId(a.resource_group_name, "Microsoft.Network/applicationGateways", a.name),
    name: a.name,
    type: "Microsoft.Network/applicationGateways",
    location: a.location,
    properties: {
      sku: { name: a.sku?.[0]?.name, tier: a.sku?.[0]?.tier },
      webApplicationFirewallConfiguration: a.waf_configuration?.[0]
        ? {
            enabled: Boolean(a.waf_configuration[0].enabled),
            firewallMode: a.waf_configuration[0].firewall_mode,
            ruleSetVersion: a.waf_configuration[0].rule_set_version,
          }
        : undefined,
    },
    tags: a.tags,
  }));

  const webApps = [
    ...get("azurerm_linux_web_app"),
    ...get("azurerm_windows_web_app"),
    ...get("azurerm_app_service"),
  ].map((a) => ({
    id: a.id || subId(a.resource_group_name, "Microsoft.Web/sites", a.name),
    name: a.name,
    type: "Microsoft.Web/sites",
    location: a.location,
    properties: { httpsOnly: Boolean(a.https_only), defaultHostName: a.default_hostname },
    tags: a.tags,
  }));

  // --- resource groups ---
  const rgNames = new Set<string>();
  const rgLocation = new Map<string, string>();
  for (const r of res) {
    const a = r.attributes;
    if (a?.resource_group_name) {
      rgNames.add(a.resource_group_name);
      if (a.location && !rgLocation.has(a.resource_group_name)) rgLocation.set(a.resource_group_name, a.location);
    }
  }
  for (const a of get("azurerm_resource_group")) {
    rgNames.add(a.name);
    if (a.location) rgLocation.set(a.name, a.location);
  }
  const resourceGroups = [...rgNames].map((name) => ({
    id: `/subscriptions/${OFFLINE_SUBSCRIPTION_ID}/resourceGroups/${name}`,
    name,
    type: "Microsoft.Resources/resourceGroups",
    location: rgLocation.get(name) || "global",
    properties: { provisioningState: "Succeeded" },
  }));

  return buildByType({
    "microsoft.network/virtualnetworks": vnets,
    "microsoft.network/networksecuritygroups": [...nsgByKey.values()],
    "microsoft.network/routetables": [...rtByKey.values()],
    "microsoft.network/networkinterfaces": nics,
    "microsoft.network/publicipaddresses": pips,
    "microsoft.network/applicationgateways": appgws,
    "microsoft.compute/virtualmachines": vms,
    "microsoft.storage/storageaccounts": storage,
    "microsoft.sql/servers": sql,
    "microsoft.keyvault/vaults": vaults,
    "microsoft.web/sites": webApps,
    resourcegroups: resourceGroups,
  });
}

/* ================================================================
 * ARM JSON
 * ================================================================ */

function flattenArmResources(root: any): any[] {
  let list: any[] = [];
  if (Array.isArray(root)) list = root;
  else if (Array.isArray(root.value)) list = root.value;
  else if (Array.isArray(root.resources)) list = root.resources;
  else if (typeof root.type === "string") list = [root];

  // Recurse into nested child `resources` arrays (templates).
  const out: any[] = [];
  const walk = (r: any) => {
    if (!r || typeof r !== "object") return;
    out.push(r);
    for (const child of asArray(r.resources)) walk(child);
  };
  for (const r of list) walk(r);
  return out;
}

function rgFromId(id?: string): string {
  if (!id) return "imported";
  const m = /resourceGroups\/([^/]+)/i.exec(id);
  return m ? m[1] : "imported";
}

function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return h;
}

/**
 * Best-effort evaluator for ARM template language expressions (the `[...]`
 * strings). Enterprise/exported templates parameterize resource names, so
 * without this every name shows as `[parameters('…')]`. Resolves parameters
 * (via defaultValue, else the exported-template `<type>_<name>_<prop>` naming
 * convention), variables (recursively), and the common functions.
 */
function makeArmResolver(template: any) {
  const params = (template && template.parameters) || {};
  const vars = (template && template.variables) || {};
  const varCache: Record<string, any> = {};

  const deriveNameFromParam = (pname: string): string => {
    // Azure "Export template" names params like `virtualMachines_myVm_name`.
    const parts = pname.split("_");
    if (parts.length >= 3) return parts.slice(1, -1).join("_");
    if (parts.length === 2) return parts[0];
    return pname;
  };

  const getParam = (name: string): any => {
    const p = params[name];
    if (p && typeof p === "object" && "defaultValue" in p && p.defaultValue !== undefined) {
      return evalValue(p.defaultValue);
    }
    return deriveNameFromParam(name);
  };
  const getVar = (name: string): any => {
    if (name in varCache) return varCache[name];
    varCache[name] = name; // recursion guard
    const v = vars[name];
    const out = v !== undefined ? evalValue(v) : name;
    varCache[name] = out;
    return out;
  };

  function callFn(name: string, args: any[]): any {
    switch (name.toLowerCase()) {
      case "parameters":
        return getParam(String(args[0]));
      case "variables":
        return getVar(String(args[0]));
      case "concat":
        return args.every((a) => Array.isArray(a))
          ? ([] as any[]).concat(...args)
          : args.map((a) => (Array.isArray(a) ? a.join("") : String(a ?? ""))).join("");
      case "tolower":
        return String(args[0] ?? "").toLowerCase();
      case "toupper":
        return String(args[0] ?? "").toUpperCase();
      case "trim":
        return String(args[0] ?? "").trim();
      case "format": {
        const fmt = String(args[0] ?? "");
        return fmt.replace(/\{(\d+)\}/g, (_, d) => String(args[Number(d) + 1] ?? ""));
      }
      case "resourceid": {
        const strs = args.map((a) => String(a));
        let typeIdx = strs.findIndex((a) => a.includes("/") && a.toLowerCase().includes("microsoft."));
        if (typeIdx < 0) typeIdx = strs.findIndex((a) => a.includes("/"));
        const type = typeIdx >= 0 ? strs[typeIdx] : "";
        const names = strs.slice((typeIdx >= 0 ? typeIdx : 0) + 1);
        const leaf = names.length ? names.join("/") : strs[strs.length - 1];
        return subId("imported", type, leaf);
      }
      case "substring": {
        const str = String(args[0] ?? "");
        const start = Number(args[1] ?? 0);
        return args[2] != null ? str.substr(start, Number(args[2])) : str.substring(start);
      }
      case "replace":
        return String(args[0] ?? "").split(String(args[1])).join(String(args[2]));
      case "uniquestring":
        return "u" + (Math.abs(hashStr(args.map(String).join("|"))).toString(36) + "00000").slice(0, 8);
      case "resourcegroup":
        return { name: "imported", location: "global", id: "" };
      case "subscription":
        return { subscriptionId: OFFLINE_SUBSCRIPTION_ID };
      case "guid":
        return "00000000-0000-0000-0000-000000000000";
      case "if":
        return args[0] ? args[1] : args[2];
      default:
        return args.length ? args[0] : "";
    }
  }

  function evalExpr(src: string): any {
    let i = 0;
    const s = src;
    const skip = () => {
      while (i < s.length && /\s/.test(s[i])) i++;
    };
    function readString(): string {
      i++; // opening '
      let out = "";
      while (i < s.length) {
        if (s[i] === "'") {
          if (s[i + 1] === "'") {
            out += "'";
            i += 2;
            continue;
          }
          i++; // closing '
          break;
        }
        out += s[i++];
      }
      return out;
    }
    function accessors(val: any): any {
      for (;;) {
        skip();
        if (s[i] === ".") {
          i++;
          let prop = "";
          while (i < s.length && /[A-Za-z0-9_]/.test(s[i])) prop += s[i++];
          skip();
          if (s[i] === "(") {
            i++;
            const a: any[] = [];
            skip();
            if (s[i] !== ")") {
              a.push(parseExpr());
              skip();
              while (s[i] === ",") {
                i++;
                a.push(parseExpr());
                skip();
              }
            }
            if (s[i] === ")") i++;
            if (prop.toLowerCase() === "tolower") val = String(val).toLowerCase();
            else if (prop.toLowerCase() === "toupper") val = String(val).toUpperCase();
          } else {
            val = val != null ? val[prop] : undefined;
          }
        } else if (s[i] === "[") {
          i++;
          const idx = parseExpr();
          skip();
          if (s[i] === "]") i++;
          val = val != null ? val[idx as any] : undefined;
        } else break;
      }
      return val;
    }
    function parseExpr(): any {
      skip();
      const ch = s[i];
      if (ch === "'") return accessors(readString());
      if (/[0-9]/.test(ch) || (ch === "-" && /[0-9]/.test(s[i + 1]))) {
        let num = "";
        if (s[i] === "-") num += s[i++];
        while (i < s.length && /[0-9.]/.test(s[i])) num += s[i++];
        return Number(num);
      }
      let id = "";
      while (i < s.length && /[A-Za-z0-9_]/.test(s[i])) id += s[i++];
      skip();
      if (s[i] === "(") {
        i++;
        const args: any[] = [];
        skip();
        if (s[i] !== ")") {
          args.push(parseExpr());
          skip();
          while (s[i] === ",") {
            i++;
            args.push(parseExpr());
            skip();
          }
        }
        if (s[i] === ")") i++;
        return accessors(callFn(id, args));
      }
      return accessors(id);
    }
    return parseExpr();
  }

  function resolveString(v: string): any {
    if (v.length > 1 && v[0] === "[" && v[v.length - 1] === "]") {
      if (v[1] === "[") return v.slice(1); // escaped [[ literal
      try {
        return evalExpr(v.slice(1, -1));
      } catch {
        return v;
      }
    }
    return v;
  }
  function evalValue(v: any): any {
    if (typeof v === "string") return resolveString(v);
    if (Array.isArray(v)) return v.map(evalValue);
    if (v && typeof v === "object") {
      const o: any = {};
      for (const k of Object.keys(v)) o[k] = evalValue(v[k]);
      return o;
    }
    return v;
  }

  return { value: evalValue };
}

function parseArm(root: any): Record<string, unknown[]> {
  // Deployment templates carry expressions; resolve them. Resolved resource
  // lists (az resource list / ARM REST) have no expressions — pass through.
  const isTemplate = !Array.isArray(root) && Boolean(root.$schema || root.parameters || root.variables);
  const resolver = makeArmResolver(isTemplate ? root : null);
  let resources = flattenArmResources(root);
  if (isTemplate) resources = resources.map((r) => resolver.value(r));
  const byType: Record<string, any[]> = {};

  // Index child resources so we can fold subnets/rules/routes into parents.
  const childSubnets: any[] = [];
  const childRules: any[] = [];
  const childRoutes: any[] = [];

  for (const r of resources) {
    if (typeof r.type !== "string") continue;
    const t = lc(r.type);
    if (t === "microsoft.network/virtualnetworks/subnets") childSubnets.push(r);
    else if (t === "microsoft.network/networksecuritygroups/securityrules") childRules.push(r);
    else if (t === "microsoft.network/routetables/routes") childRoutes.push(r);
  }

  const ensureId = (r: any): any => {
    if (!r.id && typeof r.name === "string") {
      const leaf = String(r.name).split("/").pop() ?? String(r.name);
      r.id = subId(rgFromId(r.id), r.type, leaf);
    }
    return r;
  };

  const foldChild = (parentType: string, childList: any[], prop: string) => {
    for (const child of childList) {
      const name: string = child.name || "";
      const [parentName, childName] = name.includes("/") ? name.split("/") : [undefined, name];
      if (!parentName) continue;
      const parent = resources.find(
        (p) => lc(p.type) === parentType && (p.name === parentName || String(p.name).endsWith(`/${parentName}`)),
      );
      if (!parent) continue;
      parent.properties = parent.properties || {};
      parent.properties[prop] = parent.properties[prop] || [];
      parent.properties[prop].push({ name: childName, properties: child.properties || {} });
    }
  };
  foldChild("microsoft.network/virtualnetworks", childSubnets, "subnets");
  foldChild("microsoft.network/networksecuritygroups", childRules, "securityRules");
  foldChild("microsoft.network/routetables", childRoutes, "routes");

  const SUPPORTED = new Set(Object.keys(TYPE_LABELS).filter((k) => k !== "resourcegroups"));

  for (const r of resources) {
    if (typeof r.type !== "string") continue;
    const t = lc(r.type);
    if (!SUPPORTED.has(t)) continue;
    ensureId(r);
    r.properties = r.properties || {};
    if (!byType[t]) byType[t] = [];
    byType[t].push(r);
  }

  // Resource groups from ids.
  const rgNames = new Set<string>();
  for (const r of resources) {
    const rg = /resourceGroups\/([^/]+)/i.exec(r.id || "");
    if (rg) rgNames.add(rg[1]);
  }
  byType["resourcegroups"] = [...rgNames].map((name) => ({
    id: `/subscriptions/${OFFLINE_SUBSCRIPTION_ID}/resourceGroups/${name}`,
    name,
    type: "Microsoft.Resources/resourceGroups",
    location: "global",
    properties: { provisioningState: "Succeeded" },
  }));

  return byType;
}

/* ================================================================
 * dispatch
 * ================================================================ */

function buildByType(map: Record<string, unknown[]>): Record<string, unknown[]> {
  const out: Record<string, unknown[]> = {};
  for (const [k, v] of Object.entries(map)) if (v && v.length) out[k] = v;
  return out;
}

function detectFormat(obj: any): "arm" | "tfstate" | null {
  if (!obj || typeof obj !== "object") return null;
  if (obj.terraform_version !== undefined) return "tfstate";
  if (obj.format_version !== undefined && obj.values !== undefined) return "tfstate";
  if (
    Array.isArray(obj.resources) &&
    obj.resources.some((r: any) => r && (r.instances || (typeof r.type === "string" && r.type.startsWith("azurerm_"))))
  ) {
    return "tfstate";
  }
  if (Array.isArray(obj)) return "arm";
  if (Array.isArray(obj.value)) return "arm";
  if (obj.$schema && Array.isArray(obj.resources)) return "arm";
  if (Array.isArray(obj.resources)) return "arm";
  if (typeof obj.type === "string" && obj.type.includes("/")) return "arm";
  return null;
}

export class ParseError extends Error {}

/**
 * Parse a file's text into a ParsedEstate. Throws ParseError with a friendly
 * message on unrecognized/empty input.
 */
export function parseInfraFile(fileName: string, text: string, lastModifiedMs?: number): ParsedEstate {
  let obj: any;
  try {
    obj = JSON.parse(text);
  } catch {
    throw new ParseError(
      "That file isn't valid JSON. Upload a Terraform state file (.tfstate), `terraform show -json` output, or an Azure ARM/resource JSON export.",
    );
  }

  const format = detectFormat(obj);
  if (!format) {
    throw new ParseError(
      "Couldn't recognize this file. Supported: Terraform state (.tfstate), `terraform show -json`, or Azure ARM JSON (a resource list, exported template, or single resource).",
    );
  }

  const byType = format === "tfstate" ? parseTfstate(obj) : parseArm(obj);
  const total = Object.values(byType).reduce((s, arr) => s + arr.length, 0);
  if (total === 0) {
    throw new ParseError(
      "No supported Azure resources were found in that file. This build reads networking (VNets, subnets, NSGs, route tables, peerings) and core inventory (VMs, storage, SQL, Key Vault, public IPs, app gateways).",
    );
  }

  const summary: EstateSummaryRow[] = Object.entries(byType)
    .map(([type, arr]) => ({
      type,
      label: TYPE_LABELS[type] ?? type,
      count: arr.length,
    }))
    .sort((a, b) => b.count - a.count);

  const capturedAt = new Date(
    lastModifiedMs && Number.isFinite(lastModifiedMs) ? lastModifiedMs : Date.now(),
  ).toISOString();

  const baseName = fileName.replace(/\.[^.]+$/, "") || "Uploaded estate";

  return {
    source: format,
    fileName,
    capturedAt,
    subscriptionId: OFFLINE_SUBSCRIPTION_ID,
    subscriptionName: baseName,
    byType,
    summary,
    total,
  };
}
