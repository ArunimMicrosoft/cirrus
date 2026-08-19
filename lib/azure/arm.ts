/**
 * Thin Azure Resource Manager REST client used by CF Pages Functions.
 *
 * We call ARM directly with fetch() rather than the @azure/arm-* SDKs to keep
 * the Workers bundle small. All operations are read-only (GET / POST-for-query).
 */

const ARM_BASE = "https://management.azure.com";

export interface ArmRequestOptions {
  /** ARM API version. Defaults to a recent stable value if omitted. */
  apiVersion?: string;
  /** Extra query parameters. */
  query?: Record<string, string | number | boolean | undefined>;
  /** Request body for POST. */
  body?: unknown;
  /** HTTP method. Defaults to GET. */
  method?: "GET" | "POST";
  /** Optional AbortSignal to cancel the request. */
  signal?: AbortSignal;
}

export class ArmError extends Error {
  status: number;
  body: string;
  constructor(message: string, status: number, body: string) {
    super(message);
    this.name = "ArmError";
    this.status = status;
    this.body = body;
  }
}

/**
 * Call ARM. `path` should start with a slash (e.g. `/subscriptions`).
 * Callers pass a raw ARM access token — the SP vs delegated-user distinction
 * lives one layer up in the session-aware token acquisition.
 * Throws ArmError on non-2xx responses.
 */
export async function armFetch<T>(
  token: string,
  path: string,
  opts: ArmRequestOptions = {},
): Promise<T> {
  const url = new URL(`${ARM_BASE}${path.startsWith("/") ? path : `/${path}`}`);
  if (opts.apiVersion) url.searchParams.set("api-version", opts.apiVersion);
  if (opts.query) {
    for (const [k, v] of Object.entries(opts.query)) {
      if (v !== undefined && v !== null && v !== "") url.searchParams.set(k, String(v));
    }
  }
  const init: RequestInit = {
    method: opts.method ?? "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
      ...(opts.body ? { "Content-Type": "application/json" } : {}),
    },
    signal: opts.signal,
  };
  if (opts.body) init.body = JSON.stringify(opts.body);

  const resp = await fetch(url.toString(), init);
  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new ArmError(
      `ARM ${resp.status} on ${url.pathname}: ${text.slice(0, 400)}`,
      resp.status,
      text,
    );
  }
  if (resp.status === 204) return undefined as unknown as T;
  return (await resp.json()) as T;
}

/**
 * Walk `nextLink` pagination and return the flattened `value` array.
 * ARM endpoints that return `{ value, nextLink }` use this shape uniformly.
 */
export async function armList<T>(
  token: string,
  path: string,
  opts: ArmRequestOptions = {},
): Promise<T[]> {
  const results: T[] = [];
  let firstUrl: URL | null = new URL(
    `${ARM_BASE}${path.startsWith("/") ? path : `/${path}`}`,
  );
  if (opts.apiVersion) firstUrl.searchParams.set("api-version", opts.apiVersion);
  if (opts.query) {
    for (const [k, v] of Object.entries(opts.query)) {
      if (v !== undefined && v !== null && v !== "")
        firstUrl.searchParams.set(k, String(v));
    }
  }

  let nextUrl: string | null = firstUrl.toString();

  while (nextUrl) {
    const resp: Response = await fetch(nextUrl, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
      },
      signal: opts.signal,
    });
    if (!resp.ok) {
      const text = await resp.text().catch(() => "");
      throw new ArmError(
        `ARM ${resp.status} on ${nextUrl}: ${text.slice(0, 400)}`,
        resp.status,
        text,
      );
    }
    const page = (await resp.json()) as { value: T[]; nextLink?: string };
    if (Array.isArray(page.value)) results.push(...page.value);
    nextUrl = page.nextLink ?? null;
  }
  return results;
}

/**
 * Common ARM API versions used across the app.
 *
 * NOTE: The Microsoft.Compute RP versions its sub-resource types INDEPENDENTLY.
 * A VM API version that is valid for /virtualMachines may not be valid for
 * /disks, /snapshots, or /usages. We split them explicitly here.
 */
export const ArmApi = {
  subscriptions: "2022-12-01",
  resources: "2021-04-01",
  resourceGroups: "2021-04-01",
  // Compute (each resource type has its own version series)
  computeVms: "2024-07-01",
  computeDisks: "2023-04-02",
  computeSnapshots: "2023-04-02",
  computeUsage: "2024-07-01",
  computeSkus: "2021-07-01",
  // Backwards-compat alias — deprecated, keep for a version, prefer explicit above.
  compute: "2023-04-02",
  network: "2023-11-01",
  privateDnsZones: "2020-06-01",
  dnsZones: "2018-05-01",
  storage: "2023-05-01",
  web: "2023-12-01",
  sql: "2023-08-01-preview",
  monitor: "2021-05-01",
  monitorMetrics: "2018-01-01",
  monitorActivityLog: "2015-04-01",
  advisor: "2023-01-01",
  keyvault: "2023-07-01",
  authorization: "2022-04-01",
  recoveryservices: "2023-08-01",
  recoveryservicesBackup: "2023-06-01",
  reservations: "2022-11-01",
  resourceGraph: "2022-10-01",
  // Cost Management / Consumption (read-only GET analytics: reservation
  // recommendations, price sheets, usage). Reader includes */read, so no
  // elevated cost role is required for these GET endpoints.
  consumption: "2024-08-01",
  // Cost Management Query (POST analytics query — read-only, cannot mutate).
  // Requires the "Cost Management Reader" role (query is an /action, not /read).
  costManagement: "2023-11-01",
} as const;
