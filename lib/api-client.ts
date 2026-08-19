/**
 * Frontend API client. All calls go to serverless functions under /api/*
 * which handle authentication and proxy to Azure REST endpoints server-side.
 */

import type { AzureSubscription } from "./azure/types";
import { getOfflineEstate } from "./hooks/use-offline";
import { offlineSubscription, resolveEstateList, resolveEstateSingle } from "./offline/estate";
import { demoInstanceView, demoMetrics, demoCost, demoArmList, demoGraph } from "./offline/demo-api";

const OFFLINE_LIVE_ONLY = (feature: string) =>
  new Error(
    `${feature} needs a live Azure connection — that data isn't present in an infrastructure file. Connect a tenant to use it.`,
  );

export interface AuthState {
  authenticated: boolean;
  /** Whether "Sign in with my account" is available on this deployment. */
  deviceCodeEnabled?: boolean;
  type?: "sp" | "device";
  tenantId?: string;
  clientId?: string;
  lighthouse?: boolean;
  user?: { name: string | null; username: string | null } | null;
}

export interface LoginRequest {
  tenantId: string;
  clientId: string;
  clientSecret: string;
  lighthouse: boolean;
}

export interface LoginResponse {
  authenticated: true;
  tenantId: string;
  subscriptions: AzureSubscription[];
}

export interface DeviceStartResponse {
  userCode: string;
  deviceCode: string;
  verificationUri: string;
  message?: string;
  /** Seconds until the code expires — usually 900 (15 minutes). */
  expiresIn: number;
  /** Minimum polling interval in seconds — usually 5. */
  interval: number;
  lighthouse: boolean;
}

export type DevicePollResponse =
  | { pending: true; slowDown?: boolean }
  | {
      authenticated: true;
      tenantId: string;
      subscriptions: AzureSubscription[];
      user: { name: string | null; username: string | null };
    };

async function parseError(resp: Response): Promise<Error> {
  let message = `${resp.status} ${resp.statusText}`;
  const contentType = resp.headers.get("content-type") ?? "";
  try {
    const text = await resp.text();
    if (text) {
      // An HTML body where JSON was expected means the request was
      // intercepted before it reached the backend — almost always a
      // security/edge rule returning a challenge or block page.
      if (
        contentType.includes("text/html") ||
        text.trimStart().startsWith("<!DOCTYPE") ||
        text.trimStart().startsWith("<html")
      ) {
        // A security rule (WAF/bot/challenge) returned an HTML block page.
        // OData $filter syntax and long Azure resource IDs are common
        // false-positive triggers for generic web-application-firewall rules.
        const looksLikeSecurityBlock =
          resp.status === 403 ||
          /ray id|has been blocked|attention required|just a moment/i.test(text);
        if (looksLikeSecurityBlock) {
          return new Error(
            "This request was stopped by a network security rule before it reached Azure. Legitimate Azure queries can trip generic firewall rules. Please contact your administrator to allow the application's own API paths.",
          );
        }
        if (resp.status === 404) {
          return new Error(
            "The backend API is not responding. If you are running the app locally, make sure you started it with the full local runtime rather than the front-end-only dev server.",
          );
        }
        return new Error(
          `The server returned an unexpected response (status ${resp.status}). The backend may be unavailable.`,
        );
      }
      try {
        const json = JSON.parse(text);
        message = json.error ?? json.message ?? text;
      } catch {
        message = text;
      }
    }
  } catch {
    // ignore
  }
  return new Error(message);
}

/**
 * Serialise extra ARM query params into a `&key=value` string. Values are
 * URL-encoded. Returns "" when params is empty/undefined so callers can
 * always append the result to an existing query string.
 */
function encodeParams(
  params?: Record<string, string | number | undefined>,
): string {
  if (!params) return "";
  const parts: string[] = [];
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === "") continue;
    parts.push(`${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`);
  }
  return parts.length ? `&${parts.join("&")}` : "";
}

async function jsonFetch<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const resp = await fetch(path, {
    ...init,
    credentials: "include",
    headers: {
      Accept: "application/json",
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...(init.headers ?? {}),
    },
  });
  if (!resp.ok) {
    throw await parseError(resp);
  }
  if (resp.status === 204) return undefined as unknown as T;
  // Some misconfigured proxies return 200 with HTML — treat that as an error.
  const contentType = resp.headers.get("content-type") ?? "";
  if (contentType.includes("text/html")) {
    throw new Error(
      "The backend API returned an unexpected response. If you are running the app locally, make sure the full local runtime is started rather than the front-end-only dev server.",
    );
  }
  return (await resp.json()) as T;
}

export const api = {
  auth: {
    me: (): Promise<AuthState> => {
      const estate = getOfflineEstate();
      if (estate) {
        return Promise.resolve({ authenticated: true, type: "sp", tenantId: "file" });
      }
      return jsonFetch<AuthState>("/api/auth/me");
    },
    login: (payload: LoginRequest) =>
      jsonFetch<LoginResponse>("/api/auth/login", {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    logout: () => jsonFetch<void>("/api/auth/logout", { method: "POST" }),
    /** Start the OAuth 2.0 Device Code flow. Returns the code + verification URL. */
    deviceStart: (lighthouse: boolean) =>
      jsonFetch<DeviceStartResponse>("/api/auth/device/start", {
        method: "POST",
        body: JSON.stringify({ lighthouse }),
      }),
    /** Poll the device code endpoint. Returns pending or authenticated. */
    devicePoll: (deviceCode: string, lighthouse: boolean) =>
      jsonFetch<DevicePollResponse>("/api/auth/device/poll", {
        method: "POST",
        body: JSON.stringify({ deviceCode, lighthouse }),
      }),
  },
  subscriptions: (): Promise<{ value: AzureSubscription[] }> => {
    const estate = getOfflineEstate();
    if (estate) return Promise.resolve({ value: [offlineSubscription(estate)] });
    return jsonFetch<{ value: AzureSubscription[] }>("/api/subscriptions");
  },
  /**
   * Generic ARM proxy. Pass the ARM path (without the leading `/subscriptions/{sub}`)
   * and the subscription ID; the proxy inserts the correct path and Bearer token.
   * Extra ARM query params (e.g. `$filter`) can be passed via `params`.
   */
  arm: <T>(
    subscriptionId: string,
    armPath: string,
    apiVersion: string,
    params?: Record<string, string | number | undefined>,
  ): Promise<T> => {
    const estate = getOfflineEstate();
    if (estate) {
      if (estate.demo) {
        const lp = armPath.toLowerCase();
        if (lp.endsWith("/instanceview")) return Promise.resolve(demoInstanceView(armPath) as T);
        if (lp.includes("/microsoft.insights/metrics")) return Promise.resolve(demoMetrics(armPath, params) as T);
      }
      const found = resolveEstateSingle(estate, armPath);
      if (found) return Promise.resolve(found as T);
      return Promise.reject(OFFLINE_LIVE_ONLY("This resource"));
    }
    return jsonFetch<T>(
      `/api/arm/${encodeURIComponent(subscriptionId)}${
        armPath.startsWith("/") ? armPath : `/${armPath}`
      }?api-version=${encodeURIComponent(apiVersion)}${encodeParams(params)}`,
    );
  },
  /**
   * Same as arm() but walks pagination server-side and returns the aggregated array.
   */
  armList: <T>(
    subscriptionId: string,
    armPath: string,
    apiVersion: string,
    params?: Record<string, string | number | undefined>,
  ): Promise<{ value: T[] }> => {
    const estate = getOfflineEstate();
    if (estate) {
      if (estate.demo) {
        const handled = demoArmList(armPath, params, estate);
        if (handled) return Promise.resolve(handled as { value: T[] });
      }
      return Promise.resolve({ value: resolveEstateList(estate, armPath) as T[] });
    }
    return jsonFetch<{ value: T[] }>(
      `/api/arm/${encodeURIComponent(subscriptionId)}${
        armPath.startsWith("/") ? armPath : `/${armPath}`
      }?api-version=${encodeURIComponent(apiVersion)}&_paginate=1${encodeParams(params)}`,
    );
  },
  /**
   * Read-only Azure Resource Graph (KQL) query. Body is passed through as-is
   * to the Resource Graph API which is a query-only Kusto engine.
   */
  graph: <T = unknown>(query: string, subscriptions?: string[], top = 500) => {
    const estate = getOfflineEstate();
    if (estate?.demo) {
      return Promise.resolve(demoGraph(query, estate) as { totalRecords: number; count: number; data: T[]; skipToken?: string });
    }
    if (estate) return Promise.reject(OFFLINE_LIVE_ONLY("Resource Graph"));
    return jsonFetch<{
      totalRecords: number;
      count: number;
      data: T[];
      skipToken?: string;
    }>("/api/graph", {
      method: "POST",
      body: JSON.stringify({ query, subscriptions, top }),
    });
  },
  /**
   * Read-only Azure Cost Management actual-cost query. POST is the API
   * contract (query definition in body); it is an analytics query engine
   * that cannot mutate resources. Returns the raw columns/rows table.
   */
  cost: <T = unknown>(
    subscriptionId: string,
    from: string,
    to: string,
    granularity: "Daily" | "Monthly" = "Daily",
  ) => {
    const estate = getOfflineEstate();
    if (estate?.demo) return Promise.resolve(demoCost(estate, from, to) as T);
    if (estate) return Promise.reject(OFFLINE_LIVE_ONLY("Cost analysis"));
    return jsonFetch<T>("/api/cost", {
      method: "POST",
      body: JSON.stringify({ subscriptionId, from, to, granularity }),
    });
  },
  /** VM price lookup (PAYG + optional RI). */
  vmPrice: (size: string, region: string, ri = false) =>
    jsonFetch<{
      size: string;
      region: string;
      payg: { rate: number; live: boolean };
      ri: { ri1y: number | null; ri3y: number | null; live: boolean } | null;
    }>(
      `/api/prices/vm?size=${encodeURIComponent(size)}&region=${encodeURIComponent(
        region,
      )}${ri ? "&ri=1" : ""}`,
    ),
};
