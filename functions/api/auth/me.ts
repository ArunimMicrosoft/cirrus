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

  // Public capability flag — surfaces which sign-in methods this deployment
  // supports so the login UI can hide options that aren't configured.
  const deviceCodeEnabled = Boolean(env.AZURE_AD_CLIENT_ID);

  if (!env.SESSION_SECRET) {
    return json({ authenticated: false, deviceCodeEnabled });
  }
  const session = await readSession(
    request,
    env.SESSION_SECRET,
    env.SESSION_EPOCH,
  );
  if (!session) return json({ authenticated: false, deviceCodeEnabled });
  return json({
    authenticated: true,
    deviceCodeEnabled,
    type: session.type,
    tenantId: session.tenantId,
    clientId: session.clientId,
    lighthouse: session.lighthouse,
    user:
      session.type === "device"
        ? {
            name: session.name ?? null,
            username: session.username ?? null,
          }
        : null,
  });
};
