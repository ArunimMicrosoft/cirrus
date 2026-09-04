/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Demo-only synthetic responses. When the active estate is the built-in demo
 * (estate.demo === true), the api-client serves these so that the live-only
 * pages — cost forecast, metrics, right-sizing, reservations, advisor, backups,
 * activity log, resource graph — all work in the no-login walkthrough.
 *
 * Everything is fabricated and derived from the demo estate so it stays
 * internally coherent. Used ONLY for the demo; a real uploaded file never hits
 * this path (those pages stay honestly disabled).
 */

import type { ParsedEstate } from "./estate";

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Deterministic RNG (mulberry32) seeded from a string. */
function rngFrom(seed: string): () => number {
  let a = hash(seed) || 1;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const allResources = (e: ParsedEstate): any[] => Object.values(e.byType).flat() as any[];
const vmsOf = (e: ParsedEstate): any[] => (e.byType["microsoft.compute/virtualmachines"] ?? []) as any[];
const rgFromId = (id: string): string => /resourceGroups\/([^/]+)/i.exec(id || "")?.[1] ?? "rg-demo";
function firstRg(e: ParsedEstate): string {
  for (const r of allResources(e)) {
    const m = /resourceGroups\/([^/]+)/i.exec(r.id || "");
    if (m) return m[1];
  }
  return "rg-demo";
}
const vmNameFromPath = (path: string): string =>
  decodeURIComponent(path.split(/\/virtualMachines\//i)[1]?.split("/")[0] ?? "vm");

/* -------- VM power state -------- */
export function demoInstanceView(path: string): any {
  const name = vmNameFromPath(path);
  const deallocated = hash(name) % 5 === 0; // ~20% deallocated
  return {
    statuses: [
      { code: "ProvisioningState/succeeded", displayStatus: "Provisioning succeeded" },
      {
        code: deallocated ? "PowerState/deallocated" : "PowerState/running",
        displayStatus: deallocated ? "VM deallocated" : "VM running",
      },
    ],
  };
}

/* -------- Azure Monitor metrics -------- */

const clampN = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

// Distinct CPU behaviours so the demo shows a realistic spread of
// size-up / size-down / keep recommendations (not everything "Keep").
const CPU_PROFILES = [
  { key: "idle", base: [8, 18], amp: 4, trend: [-2, 2] }, // over-provisioned -> size down
  { key: "steady", base: [40, 54], amp: 8, trend: [-3, 3] }, // right-sized -> keep
  { key: "rising", base: [50, 60], amp: 8, trend: [18, 34] }, // climbing -> size up soon
  { key: "hot", base: [80, 92], amp: 4, trend: [-2, 5] }, // already hot -> size up
  { key: "spiky", base: [34, 44], amp: 30, trend: [-2, 8] }, // bursty peaks -> keep/size up
];

/** Resolve the time axis from an Azure Monitor timespan/interval request. */
function metricAxis(params?: Record<string, any>): { start: number; stepMs: number; points: number } {
  const [s, e] = String(params?.timespan ?? "").split("/");
  let start = Date.parse(s);
  let end = Date.parse(e);
  const interval = String(params?.interval ?? "PT1H");
  const stepMs = /^PT\d*H/i.test(interval) ? 3_600_000 : /^PT\d*M/i.test(interval) ? 300_000 : 86_400_000;
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
    end = Date.now();
    start = end - 14 * 86_400_000;
  }
  const points = clampN(Math.floor((end - start) / stepMs) + 1, 24, 400);
  return { start, stepMs, points };
}

export function demoMetrics(path: string, params?: Record<string, any>): any {
  const vmName = vmNameFromPath(path);
  const metricNames = String(params?.metricnames ?? params?.metricnamespace ?? "Percentage CPU")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const rng = rngFrom(vmName);
  const prof = CPU_PROFILES[hash(vmName) % CPU_PROFILES.length];
  const base = prof.base[0] + rng() * (prof.base[1] - prof.base[0]);
  const trendTotal = prof.trend[0] + rng() * (prof.trend[1] - prof.trend[0]);
  const { start, stepMs, points } = metricAxis(params);

  const value = (metricNames.length ? metricNames : ["Percentage CPU"]).map((mn) => {
    const isCpu = /cpu/i.test(mn);
    const isNet = /network|bytes/i.test(mn);
    const data = Array.from({ length: points }, (_, i) => {
      const ts = new Date(start + i * stepMs).toISOString();
      const frac = points > 1 ? i / (points - 1) : 1;
      let avg: number;
      let max: number;
      if (isCpu) {
        const hour = new Date(start + i * stepMs).getUTCHours();
        const diurnal = prof.amp * Math.sin((hour / 24) * 2 * Math.PI - Math.PI / 2);
        const noise = (rng() - 0.5) * (prof.amp * 0.4 + 4);
        avg = clampN(base + trendTotal * frac + diurnal + noise, 1, 99);
        max = clampN(avg + rng() * (prof.key === "spiky" ? 25 : 12), avg, 100);
      } else if (isNet) {
        avg = rng() * 8e7;
        max = avg * (1.4 + rng());
      } else {
        avg = rng() * 100;
        max = avg * 1.3;
      }
      return {
        timeStamp: ts,
        average: Number(avg.toFixed(2)),
        maximum: Number(max.toFixed(2)),
        minimum: Number((avg * 0.5).toFixed(2)),
        total: Number((avg * 24).toFixed(2)),
        count: 24,
      };
    });
    return {
      id: "",
      type: "Microsoft.Insights/metrics",
      name: { value: mn, localizedValue: mn },
      displayDescription: mn,
      unit: isCpu ? "Percent" : isNet ? "Bytes" : "Count",
      timeseries: [{ metadatavalues: [], data }],
    };
  });

  return { cost: 0, timespan: "", interval: params?.interval ?? "PT1H", namespace: "microsoft.compute/virtualmachines", resourceregion: "eastus", value };
}

/* -------- Cost Management daily series -------- */
export function demoCost(estate: ParsedEstate, fromIso: string, toIso: string): any {
  const from = new Date(fromIso).getTime();
  const to = new Date(toIso).getTime();
  const days = Math.max(1, Math.min(400, Math.round((to - from) / 86_400_000)));
  const rng = rngFrom(estate.subscriptionName + "cost");
  const base = 180 + rng() * 520;
  const rows: any[] = [];
  for (let i = 0; i < days; i++) {
    const d = new Date(from + i * 86_400_000);
    const ymd = Number(`${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`);
    const weekend = d.getDay() === 0 || d.getDay() === 6;
    const trend = 1 + (i / days) * 0.22; // slight upward drift
    const noise = 0.85 + rng() * 0.3;
    const cost = base * trend * (weekend ? 0.62 : 1) * noise;
    rows.push([Number(cost.toFixed(2)), ymd, "USD"]);
  }
  return {
    properties: {
      columns: [
        { name: "Cost", type: "Number" },
        { name: "UsageDate", type: "Number" },
        { name: "Currency", type: "String" },
      ],
      rows,
    },
  };
}

/* -------- Reservation recommendations (Consumption raw shape) -------- */
export function demoReservations(estate: ParsedEstate): any[] {
  const skus = ["Standard_D4s_v5", "Standard_E4s_v5", "Standard_D8s_v5", "Standard_B2ms"];
  const rng = rngFrom(estate.subscriptionName + "res");
  const n = 2 + Math.floor(rng() * 3);
  return Array.from({ length: n }, (_, i) => {
    const onDemand = 300 + rng() * 900;
    const savings = onDemand * (0.2 + rng() * 0.35);
    return {
      sku: skus[i % skus.length],
      location: "eastus",
      kind: "legacy",
      properties: {
        netSavings: Number(savings.toFixed(2)),
        costWithNoReservedInstances: Number(onDemand.toFixed(2)),
        totalCostWithReservedInstances: Number((onDemand - savings).toFixed(2)),
        recommendedQuantity: 1 + Math.floor(rng() * 4),
        term: rng() > 0.5 ? "P1Y" : "P3Y",
        scope: "Single",
        lookBackPeriod: "Last30Days",
        resourceType: "VirtualMachines",
        skuName: skus[i % skus.length],
        totalHours: 730,
      },
    };
  });
}

/* -------- Advisor recommendations -------- */
export function demoAdvisor(estate: ParsedEstate): any[] {
  const targets = [...vmsOf(estate), ...((estate.byType["microsoft.storage/storageaccounts"] ?? []) as any[])];
  const impacts = ["High", "Medium", "Low"];
  const out: any[] = [];
  targets.slice(0, 12).forEach((r, i) => {
    const cat = i % 3 === 0 ? "Cost" : i % 3 === 1 ? "Security" : "HighAvailability";
    const problem =
      cat === "Cost"
        ? "This resource is underutilized and costs more than needed"
        : cat === "Security"
        ? "A recommended security control is not enabled"
        : "Improve resilience with a higher-availability configuration";
    const solution =
      cat === "Cost"
        ? "Resize or shut down the resource to reduce spend"
        : cat === "Security"
        ? "Apply the recommended security configuration"
        : "Enable zone redundancy / a backup policy";
    out.push({
      id: `${r.id}/providers/Microsoft.Advisor/recommendations/rec-${i}`,
      name: `rec-${i}`,
      type: "Microsoft.Advisor/recommendations",
      properties: {
        category: cat,
        impact: impacts[i % 3],
        lastUpdated: new Date(Date.now() - i * 86_400_000).toISOString(),
        shortDescription: { problem, solution },
        resourceMetadata: { resourceId: r.id },
      },
    });
  });
  return out;
}

/* -------- Recovery Services vaults + protected items -------- */
export function demoVaults(estate: ParsedEstate): any[] {
  const rg = firstRg(estate);
  return [
    {
      id: `/subscriptions/00000000-0000-0000-0000-000000000000/resourceGroups/${rg}/providers/Microsoft.RecoveryServices/vaults/rsv-primary`,
      name: "rsv-primary",
      type: "Microsoft.RecoveryServices/vaults",
      location: "eastus",
    },
  ];
}

export function demoProtectedItems(estate: ParsedEstate, vaultPath: string): any[] {
  const rng = rngFrom("backup" + estate.subscriptionName);
  const vms = vmsOf(estate);
  return vms.map((vm, i) => {
    const never = i === 1 && vms.length > 2;
    const actionRequired = i === 0 && vms.length > 3;
    return {
      id: `${vaultPath}/vm;iaasvmcontainerv2;${vm.name}`,
      name: `vm;iaasvmcontainerv2;${vm.name}`,
      properties: {
        friendlyName: vm.name,
        backupManagementType: "AzureIaasVM",
        protectionState: never ? "Protecting" : "Protected",
        protectionStatus: never ? "Provisioning" : "Healthy",
        healthStatus: actionRequired ? "ActionRequired" : "Passed",
        lastBackupTime: never ? undefined : new Date(Date.now() - rng() * 2 * 86_400_000).toISOString(),
        lastRecoveryPoint: never ? undefined : new Date(Date.now() - rng() * 2 * 86_400_000).toISOString(),
        policyId: `/subscriptions/x/resourceGroups/x/providers/Microsoft.RecoveryServices/vaults/rsv-primary/backupPolicies/DefaultPolicy`,
        sourceResourceId: vm.id,
      },
    };
  });
}

/* -------- Key Vault data-plane objects (keys / secrets / certificates) -------- */
export function demoVaultObjects(
  vaultUri: string,
  kind: "keys" | "secrets" | "certificates",
): any[] {
  // Derive the vault name from the URI for a stable per-vault seed.
  let vaultName = "kv-demo";
  try {
    vaultName = new URL(vaultUri).hostname.split(".")[0] || vaultName;
  } catch {
    /* keep default */
  }
  const rng = rngFrom(`${vaultName}|${kind}`);
  const nowSec = Math.floor(Date.now() / 1000);
  const DAY = 86_400;

  const base = `${vaultUri.replace(/\/$/, "")}/${kind}`;
  const idKey = kind === "keys" ? "kid" : "id";
  const count = 2 + Math.floor(rng() * 4); // 2-5 objects per kind per vault

  // A deterministic spread of lifecycle states so the demo shows every badge.
  const buckets = [
    { name: "expired", expInDays: -1 * (5 + Math.floor(rng() * 40)), enabled: true },
    { name: "soon", expInDays: 7 + Math.floor(rng() * 20), enabled: true },
    { name: "warn", expInDays: 45 + Math.floor(rng() * 40), enabled: true },
    { name: "ok", expInDays: 180 + Math.floor(rng() * 400), enabled: true },
    { name: "noexpiry", expInDays: null as number | null, enabled: true },
    { name: "disabled", expInDays: 200 + Math.floor(rng() * 100), enabled: false },
  ];

  const prefix =
    kind === "keys" ? "key" : kind === "secrets" ? "secret" : "cert";

  return Array.from({ length: count }, (_, i) => {
    const b = buckets[i % buckets.length];
    const createdDaysAgo = 30 + Math.floor(rng() * 700);
    const created = nowSec - createdDaysAgo * DAY;
    const updated = created + Math.floor(rng() * createdDaysAgo) * DAY;
    const exp = b.expInDays === null ? undefined : nowSec + b.expInDays * DAY;
    const objName = `${prefix}-${vaultName}-${i + 1}`;

    const item: Record<string, unknown> = {
      [idKey]: `${base}/${objName}/${(hash(objName) >>> 0).toString(16)}`,
      attributes: {
        enabled: b.enabled,
        created,
        updated,
        ...(exp !== undefined ? { exp } : {}),
        nbf: created,
        recoveryLevel: "Recoverable+Purgeable",
      },
      tags: {},
    };
    if (kind === "secrets") {
      item.contentType = rng() > 0.5 ? "application/x-pkcs12" : "text/plain";
      item.managed = rng() > 0.7;
    }
    if (kind === "certificates") {
      item.x5t = (hash(objName + "x5t") >>> 0).toString(16);
    }
    return item;
  });
}

/* -------- Activity log events (alerts page) -------- */
export function demoActivityLog(estate: ParsedEstate): any[] {
  const rng = rngFrom("activity" + estate.subscriptionName);
  const rg = firstRg(estate);
  const ops = [
    ["Microsoft.Compute/virtualMachines/write", "Create or Update Virtual Machine"],
    ["Microsoft.Network/networkSecurityGroups/write", "Create or Update Network Security Group"],
    ["Microsoft.Storage/storageAccounts/listKeys/action", "List Storage Account Keys"],
    ["Microsoft.Authorization/roleAssignments/write", "Create role assignment"],
    ["Microsoft.KeyVault/vaults/write", "Update Key Vault"],
    ["Microsoft.Compute/virtualMachines/deallocate/action", "Deallocate Virtual Machine"],
  ];
  const callers = ["ops@contoso.com", "cicd-sp", "admin@contoso.com", "terraform@contoso.com"];
  const levels = ["Informational", "Informational", "Warning", "Informational", "Error"];
  const statuses = ["Succeeded", "Succeeded", "Succeeded", "Failed", "Started"];
  const n = 24 + Math.floor(rng() * 16);
  return Array.from({ length: n }, (_, i) => {
    const op = ops[Math.floor(rng() * ops.length)];
    const lvl = levels[Math.floor(rng() * levels.length)];
    const st = statuses[Math.floor(rng() * statuses.length)];
    const ts = new Date(Date.now() - rng() * 7 * 86_400_000).toISOString();
    return {
      eventTimestamp: ts,
      eventName: { value: "EndRequest", localizedValue: "End request" },
      operationName: { value: op[0], localizedValue: op[1] },
      status: { value: st, localizedValue: st },
      level: lvl,
      resourceGroupName: rg,
      caller: callers[Math.floor(rng() * callers.length)],
      resourceType: { value: op[0].split("/").slice(0, 2).join("/") },
    };
  }).sort((a, b) => (a.eventTimestamp < b.eventTimestamp ? 1 : -1));
}

/* -------- Compute / Network quota usages (per region) -------- */
export function demoQuotas(path: string, estate: ParsedEstate): { value: any[] } {
  const isNetwork = /microsoft\.network\/locations/i.test(path);
  const rng = rngFrom(estate.subscriptionName + (isNetwork ? "netq" : "cpuq"));
  const mk = (name: string, label: string, limit: number, util: number, unit = "Count") => ({
    unit,
    currentValue: Math.min(limit, Math.round(limit * util)),
    limit,
    name: { value: name, localizedValue: label },
  });
  if (isNetwork) {
    return {
      value: [
        mk("VirtualNetworks", "Virtual Networks", 1000, 0.02 + rng() * 0.03),
        mk("PublicIPAddresses", "Public IP Addresses", 1000, 0.1 + rng() * 0.06),
        mk("StaticPublicIPAddresses", "Static Public IP Addresses", 1000, 0.08 + rng() * 0.05),
        mk("NetworkSecurityGroups", "Network Security Groups", 5000, 0.01 + rng() * 0.02),
        mk("LoadBalancers", "Load Balancers", 1000, 0.02 + rng() * 0.02),
      ],
    };
  }
  return {
    value: [
      mk("cores", "Total Regional vCPUs", 350, 0.82 + rng() * 0.12),
      mk("standardDSv5Family", "Standard DSv5 Family vCPUs", 100, 0.86 + rng() * 0.1),
      mk("standardESv5Family", "Standard ESv5 Family vCPUs", 100, 0.5 + rng() * 0.18),
      mk("standardBSFamily", "Standard B Family vCPUs", 50, 0.3 + rng() * 0.2),
      mk("virtualMachines", "Virtual Machines", 25000, 0.01 + rng() * 0.01),
    ],
  };
}

/* -------- Alert rules (metric / log-query / activity-log) -------- */
const slug = (s: string) => s.replace(/[^a-z0-9]+/gi, "-").toLowerCase().slice(0, 60).replace(/^-|-$/g, "");
function subScope(estate: ParsedEstate): string {
  const m = /\/subscriptions\/([^/]+)/i.exec(allResources(estate)[0]?.id ?? "");
  return m ? `/subscriptions/${m[1]}` : "/subscriptions/00000000-0000-0000-0000-000000000000";
}

export function demoMetricAlerts(estate: ParsedEstate): any[] {
  const vms = vmsOf(estate);
  const rg = firstRg(estate);
  const scope = subScope(estate);
  const ag = `${scope}/resourceGroups/${rg}/providers/microsoft.insights/actionGroups/ag-oncall`;
  const mk = (name: string, sev: number, vm: any, metricName: string, operator: string, threshold: number, desc: string) => ({
    id: `${scope}/resourceGroups/${rg}/providers/Microsoft.Insights/metricAlerts/${slug(name)}`,
    name,
    type: "Microsoft.Insights/metricAlerts",
    location: "global",
    properties: {
      description: desc,
      severity: sev,
      enabled: true,
      scopes: [vm.id],
      evaluationFrequency: "PT1M",
      windowSize: "PT5M",
      criteria: {
        "odata.type": "Microsoft.Azure.Monitor.SingleResourceMultipleMetricCriteria",
        allOf: [{ name: "cond1", metricName, metricNamespace: "Microsoft.Compute/virtualMachines", operator, threshold, timeAggregation: "Average", criterionType: "StaticThresholdCriterion" }],
      },
      actions: [{ actionGroupId: ag }],
    },
  });
  const out: any[] = [];
  if (vms[0]) out.push(mk(`[Compute] High CPU - ${vms[0].name}`, 2, vms[0], "Percentage CPU", "GreaterThan", 85, "VM CPU sustained above 85%."));
  if (vms[1]) out.push(mk(`[Compute] Low available memory - ${vms[1].name}`, 2, vms[1], "Available Memory Bytes", "LessThan", 524288000, "Free memory dropped below 500 MB."));
  if (vms[2]) out.push(mk(`[Compute] High OS disk queue - ${vms[2].name}`, 3, vms[2], "OS Disk Queue Depth", "GreaterThan", 8, "Disk queue depth is elevated."));
  return out;
}

export function demoLogAlerts(estate: ParsedEstate): any[] {
  const vms = vmsOf(estate);
  const rg = firstRg(estate);
  const scope = subScope(estate);
  const ag = `${scope}/resourceGroups/${rg}/providers/microsoft.insights/actionGroups/ag-oncall`;
  const winVm = vms.find((v) => v.properties?.storageProfile?.osDisk?.osType === "Windows") ?? vms[0];
  const site = (estate.byType["microsoft.web/sites"] ?? [])[0] as any;
  const mk = (name: string, sev: number, scopeId: string, query: string, desc: string, threshold = 0) => ({
    id: `${scope}/resourceGroups/${rg}/providers/Microsoft.Insights/scheduledQueryRules/${slug(name)}`,
    name,
    type: "Microsoft.Insights/scheduledQueryRules",
    location: "eastus",
    properties: {
      description: desc,
      severity: sev,
      enabled: true,
      scopes: [scopeId],
      evaluationFrequency: "PT5M",
      windowSize: "PT15M",
      criteria: { allOf: [{ query, timeAggregation: "Count", operator: "GreaterThan", threshold, dimensions: [] }] },
      actions: { actionGroups: [ag] },
    },
  });
  const out: any[] = [];
  if (winVm) {
    out.push(
      mk(
        "[Compute:Windows:MSSQL] Application Log - Event ID 14265: MSSQL service terminated unexpectedly",
        1,
        winVm.id,
        "Event\n| where EventLog == 'Application' and EventID == 14265\n| where Source has 'MSSQL'\n| summarize AggregatedValue = count() by bin(TimeGenerated, 5m), Computer",
        "Raised when Windows Application event ID 14265 is logged — the MSSQL service terminated unexpectedly.",
      ),
      mk(
        "[Compute:Windows] System Log - Unexpected shutdown (Event ID 6008)",
        2,
        winVm.id,
        "Event\n| where EventLog == 'System' and EventID == 6008\n| summarize AggregatedValue = count() by bin(TimeGenerated, 15m), Computer",
        "Fires on unexpected/dirty shutdown events.",
      ),
    );
  }
  if (site) {
    out.push(
      mk(
        "[Web:AppService] HTTP 5xx server-error spike",
        2,
        site.id,
        "AppServiceHTTPLogs\n| where ScStatus >= 500\n| summarize AggregatedValue = count() by bin(TimeGenerated, 5m)",
        "Fires when server errors (HTTP 5xx) exceed the threshold.",
        25,
      ),
    );
  }
  return out;
}

export function demoActivityLogAlerts(estate: ParsedEstate): any[] {
  const scope = subScope(estate);
  const ag = `${scope}/resourceGroups/${firstRg(estate)}/providers/microsoft.insights/actionGroups/ag-oncall`;
  const mk = (name: string, desc: string, ops: [string, string][]) => ({
    id: `${scope}/providers/Microsoft.Insights/activityLogAlerts/${slug(name)}`,
    name,
    type: "Microsoft.Insights/activityLogAlerts",
    location: "global",
    properties: {
      enabled: true,
      description: desc,
      scopes: [scope],
      condition: { allOf: ops.map(([field, equals]) => ({ field, equals })) },
      actions: { actionGroups: [{ actionGroupId: ag }] },
    },
  });
  return [
    mk("[Network] NSG rule created or changed", "Notifies when a network security group rule is written.", [
      ["category", "Administrative"],
      ["operationName", "Microsoft.Network/networkSecurityGroups/securityRules/write"],
    ]),
    mk("[Compute] Virtual machine deallocated", "Notifies when a VM is deallocated.", [
      ["category", "Administrative"],
      ["operationName", "Microsoft.Compute/virtualMachines/deallocate/action"],
    ]),
  ];
}

/** Route a demo armList call. Returns {value} if handled, else null. */
export function demoArmList(path: string, params: Record<string, any> | undefined, estate: ParsedEstate): { value: any[] } | null {
  const p = path.toLowerCase();
  if (p.includes("/locations/") && p.endsWith("/usages")) return demoQuotas(path, estate);
  if (p.includes("backupprotecteditems")) return { value: demoProtectedItems(estate, path) };
  if (p.includes("microsoft.recoveryservices/vaults")) return { value: demoVaults(estate) };
  if (p.includes("microsoft.advisor/recommendations")) return { value: demoAdvisor(estate) };
  if (p.includes("microsoft.consumption/reservationrecommendations")) return { value: demoReservations(estate) };
  if (p.includes("microsoft.insights/metricalerts")) return { value: demoMetricAlerts(estate) };
  if (p.includes("microsoft.insights/scheduledqueryrules")) return { value: demoLogAlerts(estate) };
  if (p.includes("microsoft.insights/activitylogalerts")) return { value: demoActivityLogAlerts(estate) };
  if (p.includes("eventtypes/management/values")) return { value: demoActivityLog(estate) };
  return null;
}

/* -------- Resource Graph (lightweight KQL emulator for the demo templates) -------- */
export function demoGraph(query: string, estate: ParsedEstate): { totalRecords: number; count: number; data: any[] } {
  const q = query.toLowerCase();
  const resources = allResources(estate).map((r) => ({
    id: r.id,
    name: r.name,
    type: r.type,
    location: r.location ?? "",
    resourceGroup: rgFromId(r.id),
    size: r.properties?.hardwareProfile?.vmSize,
    os: r.properties?.storageProfile?.osDisk?.osType,
    sku: r.sku?.name,
  }));

  const byCount = (keyFn: (r: any) => string) => {
    const m = new Map<string, number>();
    for (const r of resources) {
      const k = keyFn(r) || "(none)";
      m.set(k, (m.get(k) ?? 0) + 1);
    }
    return [...m.entries()].map(([k, count_]) => (q.includes("by location") ? { location: k, count_ } : { type: k, count_ })).sort((a: any, b: any) => b.count_ - a.count_);
  };

  let data: any[];
  if (q.includes("summarize count()") && q.includes("by location")) {
    data = byCount((r) => r.location);
  } else if (q.includes("summarize count()") && q.includes("by type")) {
    data = byCount((r) => r.type);
  } else if (q.includes("virtualmachines") && q.includes("summarize")) {
    const m = new Map<string, number>();
    resources.filter((r) => /virtualmachines/i.test(r.type)).forEach((r) => m.set(r.size ?? "-", (m.get(r.size ?? "-") ?? 0) + 1));
    data = [...m.entries()].map(([size, count_]) => ({ size, count_ }));
  } else if (q.includes("virtualmachines")) {
    data = resources
      .filter((r) => /virtualmachines/i.test(r.type))
      .map((r) => ({ name: r.name, location: r.location, resourceGroup: r.resourceGroup, size: r.size, os: r.os }));
  } else if (q.includes("networksecuritygroups")) {
    const rows: any[] = [];
    for (const nsg of (estate.byType["microsoft.network/networksecuritygroups"] ?? []) as any[]) {
      for (const rule of nsg.properties?.securityRules ?? []) {
        const pr = rule.properties ?? {};
        const src = (pr.sourceAddressPrefix ?? "").toLowerCase();
        if (pr.direction === "Inbound" && pr.access === "Allow" && ["*", "0.0.0.0/0", "internet"].includes(src) && ["22", "3389", "*"].includes(pr.destinationPortRange)) {
          rows.push({ nsg: nsg.name, ruleName: rule.name, port: pr.destinationPortRange, source: pr.sourceAddressPrefix });
        }
      }
    }
    data = rows;
  } else if (q.includes("publicipaddresses")) {
    data = resources.filter((r) => /publicipaddresses/i.test(r.type)).map((r) => ({ name: r.name, resourceGroup: r.resourceGroup, location: r.location, sku: r.sku }));
  } else if (q.includes("storageaccounts")) {
    data = ((estate.byType["microsoft.storage/storageaccounts"] ?? []) as any[])
      .filter((s) => (q.includes("allowblobpublicaccess") ? s.properties?.allowBlobPublicAccess : true))
      .map((s) => ({ name: s.name, resourceGroup: rgFromId(s.id), location: s.location, sku: s.sku?.name }));
  } else if (q.includes("disks") || q.includes("snapshots")) {
    data = []; // none in the demo estate
  } else {
    data = resources.map((r) => ({ name: r.name, type: r.type, location: r.location, resourceGroup: r.resourceGroup }));
  }

  return { totalRecords: data.length, count: data.length, data };
}
