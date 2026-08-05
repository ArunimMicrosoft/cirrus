/**
 * GET /api/subscriptions
 *
 * Returns every subscription accessible to the authenticated Service
 * Principal. Walks nextLink pagination so accounts with more than one page
 * of subscriptions show all of them. Delegated subscriptions (via Azure
 * Lighthouse) appear with isHome=false.
 */

import { errorJson, json, methodNotAllowed, requireSession } from "@/functions/_utils";
import type { Env } from "@/functions/types";
import { listAllSubscriptions } from "@/functions/_subscriptions";

export const onRequest: PagesFunction<Env> = async ({ request, env }) => {
  if (request.method !== "GET") return methodNotAllowed(["GET"]);
  const [session, err] = await requireSession(request, env);
  if (err) return err;

  try {
    const value = await listAllSubscriptions({
      tenantId: session.tenantId,
      clientId: session.clientId,
      clientSecret: session.clientSecret,
    });
    return json({ value });
  } catch (e) {
    return errorJson(
      `Failed to list subscriptions: ${e instanceof Error ? e.message : String(e)}`,
      500,
    );
  }
};
