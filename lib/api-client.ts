/**
 * Frontend API client. All calls go to Cloudflare Pages Functions under /api/*
 * which handle authentication and proxy to Azure REST endpoints server-side.
 */

import type { AzureSubscription } from "./azure/types";

export interface AuthState {
  authenticated: boolean;
  tenantId?: string;
  clientId?: string;
  lighthouse?: boolean;
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

async function parseError(resp: Response): Promise<Error> {
  let message = `${resp.status} ${resp.statusText}`;
  const contentType = resp.headers.get("content-type") ?? "";
  try {
    const text = await resp.text();
    if (text) {
      // Detect the "HTML 404 from next dev server" case: it means the caller
      // is running `next dev` (no Pages Functions) instead of `wrangler pages
      // dev`, so /api/* routes don't exist. Turn the cryptic HTML dump into
      // a clear, actionable error.
      if (
        contentType.includes("text/html") ||
        text.trimStart().startsWith("<!DOCTYPE") ||
        text.trimStart().startsWith("<html")
      ) {
        if (resp.status === 404) {
          return new Error(
            "API endpoint not found (received HTML 404). If you're running locally, use `npm run pages:dev` (port 8788) instead of `npm run dev` — the Next.js dev server does not run Cloudflare Pages Functions.",
          );
        }
        return new Error(
          `Server returned HTML instead of JSON (status ${resp.status}). Backend is likely not running or a proxy is in the way.`,
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
      "API returned HTML with 200 status. If running locally, use `npm run pages:dev` — the Next.js dev server does not run Pages Functions.",
    );
  }
  return (await resp.json()) as T;
}

export const api = {
  auth: {
    me: () => jsonFetch<AuthState>("/api/auth/me"),
    login: (payload: LoginRequest) =>
      jsonFetch<LoginResponse>("/api/auth/login", {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    logout: () => jsonFetch<void>("/api/auth/logout", { method: "POST" }),
  },
  subscriptions: () => jsonFetch<{ value: AzureSubscription[] }>("/api/subscriptions"),
  /**
   * Generic ARM proxy. Pass the ARM path (without the leading `/subscriptions/{sub}`)
   * and the subscription ID; the proxy inserts the correct path and Bearer token.
   */
  arm: <T>(subscriptionId: string, armPath: string, apiVersion: string) =>
    jsonFetch<T>(
      `/api/arm/${encodeURIComponent(subscriptionId)}${
        armPath.startsWith("/") ? armPath : `/${armPath}`
      }?api-version=${encodeURIComponent(apiVersion)}`,
    ),
  /**
   * Same as arm() but walks pagination server-side and returns the aggregated array.
   */
  armList: <T>(subscriptionId: string, armPath: string, apiVersion: string) =>
    jsonFetch<{ value: T[] }>(
      `/api/arm/${encodeURIComponent(subscriptionId)}${
        armPath.startsWith("/") ? armPath : `/${armPath}`
      }?api-version=${encodeURIComponent(apiVersion)}&_paginate=1`,
    ),
  /**
   * Read-only Azure Resource Graph (KQL) query. Body is passed through as-is
   * to the Resource Graph API which is a query-only Kusto engine.
   */
  graph: <T = unknown>(query: string, subscriptions?: string[], top = 500) =>
    jsonFetch<{
      totalRecords: number;
      count: number;
      data: T[];
      skipToken?: string;
    }>("/api/graph", {
      method: "POST",
      body: JSON.stringify({ query, subscriptions, top }),
    }),
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
