/**
 * POST /api/graph
 *
 * Azure Resource Graph query endpoint.
 *
 * ==================================================================
 * WHY THIS ROUTE ACCEPTS POST BUT IS STILL READ-ONLY
 * ==================================================================
 * Azure Resource Graph is a Kusto-backed READ-ONLY query engine exposed at
 *   https://management.azure.com/providers/Microsoft.ResourceGraph/resources
 * The Azure API contract only defines a POST verb for this endpoint (used
 * to submit the query in the request body). It has NO write / mutation
 * operations. There is no way to create, update, or delete Azure resources
 * via Resource Graph — the entire RP is query-only.
 *
 * We forward the KQL query text unchanged. Because KQL itself lacks any
 * write primitives (no INSERT / UPDATE / DELETE), the query text can only
 * ever READ.
 * ==================================================================
 *
 * Body: { query: string, subscriptions?: string[], top?: number }
 */

import { z } from "zod";
import { getArmToken } from "@/lib/azure/auth";
import { ArmApi } from "@/lib/azure/arm";
import { errorJson, json, methodNotAllowed, requireSession } from "@/functions/_utils";
import type { Env } from "@/functions/types";

const bodySchema = z.object({
  query: z.string().min(1).max(50_000),
  subscriptions: z.array(z.string().min(1)).min(1).max(200).optional(),
  top: z.number().int().min(1).max(1000).optional(),
});

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

  try {
    const { token } = await getArmToken({
      tenantId: session.tenantId,
      clientId: session.clientId,
      clientSecret: session.clientSecret,
    });
    const url = `https://management.azure.com/providers/Microsoft.ResourceGraph/resources?api-version=${ArmApi.resourceGraph}`;
    const resp = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        query: parsed.query,
        subscriptions: parsed.subscriptions,
        options: parsed.top ? { $top: parsed.top } : undefined,
      }),
    });
    if (!resp.ok) {
      const text = await resp.text().catch(() => "");
      return errorJson(
        `Resource Graph ${resp.status}: ${text.slice(0, 500)}`,
        resp.status,
      );
    }
    return json(await resp.json());
  } catch (e) {
    return errorJson(e instanceof Error ? e.message : String(e), 500);
  }
};
