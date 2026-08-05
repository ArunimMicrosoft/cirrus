/**
 * GET /api/auth/me
 *
 * Returns a minimal auth state object. Never returns the client secret.
 */

import { readSession } from "@/lib/session";
import { json, methodNotAllowed } from "@/functions/_utils";
import type { Env } from "@/functions/types";

export const onRequest: PagesFunction<Env> = async ({ request, env }) => {
  if (request.method !== "GET") return methodNotAllowed(["GET"]);
  if (!env.SESSION_SECRET) {
    return json({ authenticated: false });
  }
  const session = await readSession(request, env.SESSION_SECRET);
  if (!session) return json({ authenticated: false });
  return json({
    authenticated: true,
    tenantId: session.tenantId,
    clientId: session.clientId,
    lighthouse: session.lighthouse,
  });
};
