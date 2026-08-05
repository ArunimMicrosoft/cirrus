/**
 * POST /api/auth/login
 *
 * Body: { tenantId, clientId, clientSecret, lighthouse }
 *
 * Validates GUID formats, verifies the Service Principal by minting a token,
 * lists ALL accessible subscriptions (paginated via nextLink), and stores
 * the SP credentials in an encrypted HttpOnly cookie.
 */

import { z } from "zod";
import { buildSessionCookie, encryptSession } from "@/lib/session";
import { verifyServicePrincipal, AzureAuthError } from "@/lib/azure/auth";
import { errorJson, json, methodNotAllowed } from "@/functions/_utils";
import type { Env } from "@/functions/types";
import { listAllSubscriptions } from "@/functions/_subscriptions";

const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const bodySchema = z.object({
  tenantId: z.string().trim().regex(GUID, "tenantId must be a valid GUID"),
  clientId: z.string().trim().regex(GUID, "clientId must be a valid GUID"),
  clientSecret: z.string().min(1, "clientSecret is required"),
  lighthouse: z.boolean().optional().default(false),
});

export const onRequest: PagesFunction<Env> = async ({ request, env }) => {
  if (request.method !== "POST") return methodNotAllowed(["POST"]);
  if (!env.SESSION_SECRET) {
    return errorJson("SESSION_SECRET is not configured on the server", 500);
  }

  let parsed: z.infer<typeof bodySchema>;
  try {
    const raw = await request.json();
    parsed = bodySchema.parse(raw);
  } catch (err) {
    const msg =
      err instanceof z.ZodError
        ? err.issues[0]?.message ?? "Invalid input"
        : "Invalid JSON body";
    return errorJson(msg, 400);
  }

  const sp = {
    tenantId: parsed.tenantId,
    clientId: parsed.clientId,
    clientSecret: parsed.clientSecret,
  };

  // 1. Verify the SP by minting a token. Surfaces bad credentials clearly.
  try {
    await verifyServicePrincipal(sp);
  } catch (err) {
    if (err instanceof AzureAuthError) {
      return errorJson(`Azure AD rejected credentials: ${err.message}`, 401);
    }
    return errorJson(
      `Authentication failed: ${err instanceof Error ? err.message : String(err)}`,
      500,
    );
  }

  // 2. List every accessible subscription (all pages).
  let subs;
  try {
    subs = await listAllSubscriptions(sp);
  } catch (err) {
    return errorJson(
      `Failed to list subscriptions: ${err instanceof Error ? err.message : String(err)}`,
      500,
    );
  }

  // 3. Encrypt session and set cookie.
  const cookieValue = await encryptSession(
    {
      tenantId: sp.tenantId,
      clientId: sp.clientId,
      clientSecret: sp.clientSecret,
      lighthouse: parsed.lighthouse,
      createdAt: new Date().toISOString(),
    },
    env.SESSION_SECRET,
  );

  return json(
    { authenticated: true, tenantId: sp.tenantId, subscriptions: subs },
    200,
    { "Set-Cookie": buildSessionCookie(cookieValue) },
  );
};
