/**
 * GET /api/arm/{subscriptionId}/{...armPath}
 *
 * READ-ONLY Azure Resource Manager proxy. Prepends `/subscriptions/{id}` to
 * the caller-supplied path, attaches the Service Principal Bearer token, and
 * forwards to management.azure.com.
 *
 * ==================================================================
 * READ-ONLY GUARANTEE
 * ==================================================================
 * This proxy accepts GET requests ONLY. Any other HTTP verb — POST, PUT,
 * PATCH, DELETE — returns 405 Method Not Allowed before any Azure call is
 * made. Because every ARM write operation requires POST/PUT/PATCH/DELETE
 * (per the ARM contract), this app is architecturally incapable of
 * creating, updating, or deleting Azure resources through this route.
 *
 * The only other backend routes are:
 *   /api/auth/*         - session cookie management (no Azure calls)
 *   /api/subscriptions  - GET only, lists subscriptions
 *   /api/prices/vm      - GET only, calls public Retail Prices API
 *   /api/graph          - POST for Resource Graph, but ARM Resource Graph
 *                         is a QUERY engine (Kusto) — inherently read-only
 *                         at the Azure API level. It CANNOT mutate resources.
 *
 * Query params:
 *   - api-version (required, forwarded to ARM)
 *   - _paginate=1  (optional; walks `nextLink` and returns aggregated { value: [...] })
 * ==================================================================
 */

import { armList, armFetch, ArmError } from "@/lib/azure/arm";
import { getArmTokenForSession } from "@/lib/azure/auth";
import { errorJson, json, methodNotAllowed, requireSession } from "@/functions/_utils";
import type { Env } from "@/functions/types";

export const onRequest: PagesFunction<
  Env,
  "subscriptionId" | "path"
> = async ({ request, env, params }) => {
  if (request.method !== "GET") return methodNotAllowed(["GET"]);

  const [session, sessionErr] = await requireSession(request, env);
  if (sessionErr) return sessionErr;

  const subscriptionId = String(params.subscriptionId ?? "");
  if (!/^[0-9a-f-]{20,}$/i.test(subscriptionId)) {
    return errorJson("Invalid subscriptionId", 400);
  }

  const pathParts = Array.isArray(params.path) ? params.path : params.path ? [params.path] : [];
  const suffix = pathParts.map((p) => encodeURIComponent(String(p))).join("/");
  const armPath = `/subscriptions/${subscriptionId}${suffix ? `/${suffix}` : ""}`;

  const url = new URL(request.url);
  const apiVersion = url.searchParams.get("api-version");
  const paginate = url.searchParams.get("_paginate") === "1";
  if (!apiVersion) {
    return errorJson("api-version query parameter is required", 400);
  }

  // Forward remaining query params (except _paginate) to ARM.
  const query: Record<string, string> = {};
  for (const [k, v] of url.searchParams.entries()) {
    if (k === "_paginate" || k === "api-version") continue;
    query[k] = v;
  }

  try {
    const { token } = await getArmTokenForSession(session);
    if (paginate) {
      const value = await armList<unknown>(token, armPath, { apiVersion, query });
      return json({ value });
    }
    const result = await armFetch<unknown>(token, armPath, { apiVersion, query });
    return json(result);
  } catch (e) {
    if (e instanceof ArmError) {
      return errorJson(e.message, e.status);
    }
    return errorJson(e instanceof Error ? e.message : String(e), 500);
  }
};
