/**
 * POST /api/auth/device/poll
 *
 * Body: { deviceCode: string, lighthouse?: boolean }
 *
 * Polls Azure AD's token endpoint for the given device code. Returns one of:
 *
 *   { pending: true }                      — user hasn't completed sign-in yet
 *   { pending: true, slowDown: true }      — client should slow its polling
 *   { authenticated: true, subscriptions } — success, cookie set
 *   { error: "..." }                       — expired / declined / other
 */

import { z } from "zod";
import { buildSessionCookie, encryptSession } from "@/lib/session";
import { ARM_DELEGATED_SCOPE, ARM_SCOPE } from "@/lib/azure/auth";
import { errorJson, json, methodNotAllowed } from "@/functions/_utils";
import { listAllSubscriptionsWithToken } from "@/functions/_subscriptions";
import type { Env } from "@/functions/types";

const bodySchema = z.object({
  deviceCode: z.string().min(10),
  lighthouse: z.boolean().optional().default(false),
});

interface TokenResponse {
  token_type?: string;
  access_token?: string;
  refresh_token?: string;
  id_token?: string;
  expires_in?: number;
  scope?: string;
  error?: string;
  error_description?: string;
}

interface IdTokenClaims {
  tid?: string;
  name?: string;
  preferred_username?: string;
  upn?: string;
}

/**
 * Best-effort JWT payload decode (no signature verification — Azure AD
 * already vouched for the token by returning it over HTTPS on our OAuth
 * exchange). We only pull display claims plus the `tid` used to route
 * subsequent ARM calls to the right tenant.
 */
function decodeIdTokenPayload(idToken: string | undefined): IdTokenClaims {
  if (!idToken) return {};
  const parts = idToken.split(".");
  if (parts.length < 2) return {};
  try {
    const b64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const pad = b64.length % 4 === 0 ? "" : "=".repeat(4 - (b64.length % 4));
    const decoded = atob(b64 + pad);
    return JSON.parse(decoded) as IdTokenClaims;
  } catch {
    return {};
  }
}

export const onRequest: PagesFunction<Env> = async ({ request, env }) => {
  if (request.method !== "POST") return methodNotAllowed(["POST"]);
  if (!env.SESSION_SECRET) {
    return errorJson("SESSION_SECRET is not configured on the server", 500);
  }
  const clientId = env.AZURE_AD_CLIENT_ID;
  if (!clientId) {
    return errorJson(
      "Device Code sign-in is not configured on this deployment.",
      501,
    );
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

  // Poll against /common — Azure AD will resolve it to the user's home tenant
  // via the device code binding.
  const tokenUrl = "https://login.microsoftonline.com/common/oauth2/v2.0/token";
  const body = new URLSearchParams({
    grant_type: "urn:ietf:params:oauth:grant-type:device_code",
    client_id: clientId,
    device_code: parsed.deviceCode,
  });

  const resp = await fetch(tokenUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body,
  });
  const data = (await resp.json().catch(() => ({}))) as TokenResponse;

  // Not yet authorized — normal poll case.
  if (resp.status === 400 || resp.status === 401) {
    if (data.error === "authorization_pending") {
      return json({ pending: true });
    }
    if (data.error === "slow_down") {
      return json({ pending: true, slowDown: true });
    }
    if (data.error === "expired_token" || data.error === "code_expired") {
      return errorJson(
        "The sign-in code expired. Start the flow again.",
        410,
      );
    }
    if (data.error === "authorization_declined") {
      return errorJson("Sign-in was declined by the user.", 401);
    }
    return errorJson(
      data.error_description ?? data.error ?? "Sign-in failed.",
      401,
    );
  }
  if (!resp.ok || !data.access_token || !data.refresh_token) {
    return errorJson(
      data.error_description ?? `Azure AD returned status ${resp.status}.`,
      resp.status || 500,
    );
  }

  // Extract the user's actual tenant from the id_token; without this the
  // subsequent ARM calls would still work through /common but we want a
  // stable tenant for HOME-vs-delegated marking.
  const claims = decodeIdTokenPayload(data.id_token);
  const tenantId = claims.tid ?? "";
  if (!tenantId) {
    return errorJson(
      "Could not determine tenant from Azure AD response.",
      500,
    );
  }

  // List subscriptions using the freshly-minted access token.
  let subs;
  try {
    subs = await listAllSubscriptionsWithToken(data.access_token, tenantId);
  } catch (err) {
    return errorJson(
      `Signed in, but failed to list subscriptions: ${err instanceof Error ? err.message : String(err)}`,
      500,
    );
  }

  // Persist the refresh_token in the encrypted cookie. Everything ARM does
  // from here on uses this refresh_token to redeem short-lived access tokens.
  const cookieValue = await encryptSession(
    {
      type: "device",
      tenantId,
      clientId,
      refreshToken: data.refresh_token,
      name: claims.name,
      username: claims.preferred_username ?? claims.upn,
      lighthouse: parsed.lighthouse,
      createdAt: new Date().toISOString(),
      epoch: env.SESSION_EPOCH ?? "1",
    },
    env.SESSION_SECRET,
  );

  return json(
    {
      authenticated: true,
      tenantId,
      subscriptions: subs,
      user: {
        name: claims.name ?? null,
        username: claims.preferred_username ?? claims.upn ?? null,
      },
    },
    200,
    { "Set-Cookie": buildSessionCookie(cookieValue) },
  );
};

// Suppress unused-scope warning without importing ARM_SCOPE just for a comment.
void ARM_DELEGATED_SCOPE;
void ARM_SCOPE;
