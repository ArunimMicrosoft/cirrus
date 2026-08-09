/**
 * POST /api/cost
 *
 * Azure Cost Management — actual daily cost query (real billed spend).
 *
 * ==================================================================
 * WHY THIS ROUTE ACCEPTS POST BUT IS STILL READ-ONLY
 * ==================================================================
 * The Cost Management Query API is an ANALYTICS query engine exposed at
 *   POST .../providers/Microsoft.CostManagement/query
 * The Azure API contract only defines a POST verb (the query definition —
 * timeframe, granularity, aggregation — travels in the request body). It has
 * NO create / update / delete operations of any kind. It can only READ and
 * aggregate billing data, exactly like the read-only Resource Graph route.
 *
 * PERMISSIONS: the Query API is gated behind `Microsoft.CostManagement/query/
 * action`, granted by the built-in "Cost Management Reader" role. If the
 * identity lacks it, Azure returns 401/403 and we surface that verbatim.
 *
 * RATE LIMITS: Cost Management allows only a handful of queries per minute and
 * returns 429 (with Retry-After) when exceeded. We (a) cache each result for
 * 6 hours in the Workers cache so repeated loads never re-hit Azure, and
 * (b) retry a bounded number of times honouring Retry-After.
 *
 * Body: { subscriptionId, from (ISO), to (ISO), granularity? "Daily"|"Monthly" }
 * ==================================================================
 */

import { z } from "zod";
import { getArmTokenForSession } from "@/lib/azure/auth";
import { ArmApi } from "@/lib/azure/arm";
import { getDefaultCache } from "@/lib/workers-cache";
import { errorJson, json, methodNotAllowed, requireSession } from "@/functions/_utils";
import type { SessionPayload } from "@/lib/session";
import type { Env } from "@/functions/types";

const bodySchema = z.object({
  subscriptionId: z.string().regex(/^[0-9a-f-]{20,}$/i, "Invalid subscriptionId"),
  from: z.string().min(10).max(40),
  to: z.string().min(10).max(40),
  granularity: z.enum(["Daily", "Monthly"]).optional(),
});

const CACHE_HOST = "https://cache.internal";
const COST_CACHE_TTL_SECONDS = 6 * 60 * 60; // cost data updates a few times/day

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Date portion only, so requests on the same day share one cache entry. */
function dayKey(iso: string): string {
  return iso.slice(0, 10);
}

/**
 * SHA-256 of the exact credential material behind the session. Cache entries
 * are scoped to this hash so a cached cost result can ONLY be served back to a
 * request carrying the same credentials (which therefore have identical Azure
 * RBAC). A different user hashes differently → cache miss → the live query
 * runs and Azure's own authorization denies any subscription they can't read.
 * This is the same partitioning the token cache in lib/azure/auth.ts uses.
 */
async function principalHash(session: SessionPayload): Promise<string> {
  const material =
    session.type === "sp"
      ? `sp|${session.tenantId}|${session.clientId}|${session.clientSecret}`
      : `device|${session.tenantId}|${session.clientId}|${session.refreshToken}`;
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(material));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export const onRequest: PagesFunction<Env> = async ({ request, env }) => {
  if (request.method !== "POST") return methodNotAllowed(["POST"]);

  const [session, sessionErr] = await requireSession(request, env);
  if (sessionErr) return sessionErr;

  let parsed: z.infer<typeof bodySchema>;
  try {
    parsed = bodySchema.parse(await request.json());
  } catch (err) {
    const msg =
      err instanceof z.ZodError
        ? err.issues[0]?.message ?? "Invalid input"
        : "Invalid JSON body";
    return errorJson(msg, 400);
  }

  const granularity = parsed.granularity ?? "Daily";
  const cache = getDefaultCache();
  // Key by the credential principal FIRST — never by subscription alone —
  // so one user's cached cost data can never be served to another.
  const principal = await principalHash(session);
  const cacheKey = new Request(
    `${CACHE_HOST}/cost/${principal}/${parsed.subscriptionId}/${dayKey(parsed.from)}_${dayKey(parsed.to)}_${granularity}`,
  );

  // Serve a cached result if we have a fresh one — the primary 429 defence.
  if (cache) {
    const hit = await cache.match(cacheKey);
    if (hit) {
      try {
        return json(await hit.json());
      } catch {
        // fall through to a live query on a corrupt cache entry
      }
    }
  }

  try {
    const { token } = await getArmTokenForSession(session);
    const url =
      `https://management.azure.com/subscriptions/${parsed.subscriptionId}` +
      `/providers/Microsoft.CostManagement/query?api-version=${ArmApi.costManagement}`;

    // ActualCost, summed per period. No grouping keeps the response a compact
    // time series: one row per day (or month) with [Cost, UsageDate, Currency].
    const queryBody = {
      type: "ActualCost",
      timeframe: "Custom",
      timePeriod: { from: parsed.from, to: parsed.to },
      dataset: {
        granularity,
        aggregation: { totalCost: { name: "Cost", function: "Sum" } },
      },
    };

    // Up to 3 attempts, honouring Retry-After but bounded so we stay well
    // within the function's execution budget.
    let resp: Response | null = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      resp = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(queryBody),
      });
      if (resp.status !== 429) break;
      if (attempt === 2) break; // out of retries
      const retryAfter = Number(resp.headers.get("Retry-After") ?? "");
      const waitMs = Math.min(
        Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 1500 * (attempt + 1),
        4000,
      );
      await sleep(waitMs);
    }

    if (!resp) return errorJson("Cost Management: no response", 502);
    if (!resp.ok) {
      const text = await resp.text().catch(() => "");
      return errorJson(`Cost Management ${resp.status}: ${text.slice(0, 500)}`, resp.status);
    }

    const data = await resp.json();
    if (cache) {
      await cache.put(
        cacheKey,
        new Response(JSON.stringify(data), {
          headers: {
            "Content-Type": "application/json",
            "Cache-Control": `max-age=${COST_CACHE_TTL_SECONDS}`,
          },
        }),
      );
    }
    return json(data);
  } catch (e) {
    return errorJson(e instanceof Error ? e.message : String(e), 500);
  }
};
