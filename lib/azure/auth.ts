/**
 * Azure AD authentication helpers.
 *
 * Two flows are supported, unified behind getTokenForSession():
 *
 *   1. Service Principal (client_credentials) — POST to /oauth2/v2.0/token
 *      with client_id + client_secret. Used when the operator has SP creds.
 *
 *   2. Delegated user token (refresh_token grant) — POST to /oauth2/v2.0/token
 *      with the refresh_token minted during the Device Code flow. Used when
 *      the operator signed in with their own Azure AD account.
 *
 * Access tokens are cached in the Workers Cache API keyed by a stable hash
 * of the credential material so concurrent Function invocations share one
 * token instead of minting one per request.
 */

import { getDefaultCache } from "@/lib/workers-cache";
import type { SessionPayload } from "@/lib/session";

export interface ServicePrincipal {
  tenantId: string;
  clientId: string;
  clientSecret: string;
}

export interface UserRefresh {
  tenantId: string;
  clientId: string;
  refreshToken: string;
}

export interface AccessToken {
  token: string;
  /** Absolute expiry as epoch milliseconds */
  expiresAt: number;
}

export const ARM_SCOPE = "https://management.azure.com/.default";
export const GRAPH_SCOPE = "https://graph.microsoft.com/.default";
/** Delegated ARM scope used by the device code flow (needs user_impersonation). */
export const ARM_DELEGATED_SCOPE =
  "https://management.azure.com/user_impersonation offline_access openid profile";

const CACHE_HOST = "https://cache.internal";
// Refresh tokens 5 minutes before they actually expire to avoid clock skew races.
const RENEW_BEFORE_MS = 5 * 60 * 1000;

/* ------------------------------------------------------------------
 * Errors + helpers
 * ------------------------------------------------------------------*/

export class AzureAuthError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "AzureAuthError";
    this.status = status;
  }
}

async function hashKey(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function cacheKey(kind: string, id: string): Request {
  return new Request(`${CACHE_HOST}/token/${kind}/${id}`);
}

/* ------------------------------------------------------------------
 * Service Principal (client_credentials)
 * ------------------------------------------------------------------*/

async function mintSpToken(
  sp: ServicePrincipal,
  scope: string,
): Promise<AccessToken> {
  const url = `https://login.microsoftonline.com/${encodeURIComponent(
    sp.tenantId,
  )}/oauth2/v2.0/token`;
  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: sp.clientId,
    client_secret: sp.clientSecret,
    scope,
  });
  const resp = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body,
  });
  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new AzureAuthError(
      `Token endpoint returned ${resp.status}: ${text.slice(0, 500)}`,
      resp.status,
    );
  }
  const data = (await resp.json()) as {
    access_token: string;
    expires_in: number;
    token_type: string;
  };
  const expiresAt = Date.now() + Math.max(60, data.expires_in - 60) * 1000;
  return { token: data.access_token, expiresAt };
}

async function getSpAccessToken(
  sp: ServicePrincipal,
  scope: string,
): Promise<AccessToken> {
  const spHash = await hashKey(`sp|${sp.tenantId}|${sp.clientId}|${sp.clientSecret}`);
  const cache = getDefaultCache();
  const key = cacheKey("sp", `${sp.tenantId}/${sp.clientId}/${encodeURIComponent(scope)}/${spHash}`);

  if (cache) {
    const hit = await cache.match(key);
    if (hit) {
      try {
        const cached = (await hit.json()) as AccessToken;
        if (cached.expiresAt - RENEW_BEFORE_MS > Date.now()) return cached;
      } catch {
        /* ignore */
      }
    }
  }

  const fresh = await mintSpToken(sp, scope);
  if (cache) {
    const ttl = Math.max(
      60,
      Math.floor((fresh.expiresAt - Date.now() - RENEW_BEFORE_MS) / 1000),
    );
    await cache.put(
      key,
      new Response(JSON.stringify(fresh), {
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": `max-age=${ttl}`,
        },
      }),
    );
  }
  return fresh;
}

/* ------------------------------------------------------------------
 * Delegated user token (refresh_token grant)
 * ------------------------------------------------------------------*/

interface RefreshResponse {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
  scope?: string;
  token_type?: string;
}

/**
 * Redeem a refresh token for a fresh access token against the user's tenant.
 * Note: some tenants rotate the refresh_token on each redemption. We do not
 * write the rotated token back to the cookie in v1 — the original one stays
 * valid for the tenant's refresh_token lifetime (typically 90 days), which
 * is well beyond our 8-hour session TTL.
 */
async function redeemRefreshToken(
  user: UserRefresh,
  scope: string,
): Promise<AccessToken> {
  const url = `https://login.microsoftonline.com/${encodeURIComponent(
    user.tenantId,
  )}/oauth2/v2.0/token`;
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    client_id: user.clientId,
    refresh_token: user.refreshToken,
    scope,
  });
  const resp = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body,
  });
  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new AzureAuthError(
      `Refresh endpoint returned ${resp.status}: ${text.slice(0, 500)}`,
      resp.status,
    );
  }
  const data = (await resp.json()) as RefreshResponse;
  const expiresAt = Date.now() + Math.max(60, data.expires_in - 60) * 1000;
  return { token: data.access_token, expiresAt };
}

async function getUserAccessToken(
  user: UserRefresh,
  scope: string,
): Promise<AccessToken> {
  const userHash = await hashKey(`user|${user.tenantId}|${user.clientId}|${user.refreshToken}`);
  const cache = getDefaultCache();
  const key = cacheKey("user", `${encodeURIComponent(scope)}/${userHash}`);

  if (cache) {
    const hit = await cache.match(key);
    if (hit) {
      try {
        const cached = (await hit.json()) as AccessToken;
        if (cached.expiresAt - RENEW_BEFORE_MS > Date.now()) return cached;
      } catch {
        /* ignore */
      }
    }
  }

  const fresh = await redeemRefreshToken(user, scope);
  if (cache) {
    const ttl = Math.max(
      60,
      Math.floor((fresh.expiresAt - Date.now() - RENEW_BEFORE_MS) / 1000),
    );
    await cache.put(
      key,
      new Response(JSON.stringify(fresh), {
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": `max-age=${ttl}`,
        },
      }),
    );
  }
  return fresh;
}

/* ------------------------------------------------------------------
 * Unified interface
 * ------------------------------------------------------------------*/

/**
 * Route to the correct token acquisition path based on session type.
 * This is the ONLY function every function endpoint should call after
 * loading the session — it hides the difference between SP and device
 * sessions.
 */
export async function getTokenForSession(
  session: SessionPayload,
  opts: { scope?: string } = {},
): Promise<AccessToken> {
  if (session.type === "sp") {
    return getSpAccessToken(
      {
        tenantId: session.tenantId,
        clientId: session.clientId,
        clientSecret: session.clientSecret,
      },
      opts.scope ?? ARM_SCOPE,
    );
  }
  // Delegated user (device code) session. ARM's delegated scope form is
  // the .default scope, or a user_impersonation form for the same audience.
  // We use .default which resolves to the delegated permissions on the app.
  return getUserAccessToken(
    {
      tenantId: session.tenantId,
      clientId: session.clientId,
      refreshToken: session.refreshToken,
    },
    opts.scope ?? ARM_SCOPE,
  );
}

/** Convenience: ARM token for a session. */
export async function getArmTokenForSession(
  session: SessionPayload,
): Promise<AccessToken> {
  return getTokenForSession(session, { scope: ARM_SCOPE });
}

/* ------------------------------------------------------------------
 * Legacy — kept for endpoints that still use SP explicitly.
 * ------------------------------------------------------------------*/

export async function getAccessToken(
  sp: ServicePrincipal,
  opts: { scope?: string } = {},
): Promise<AccessToken> {
  return getSpAccessToken(sp, opts.scope ?? ARM_SCOPE);
}

export async function getArmToken(sp: ServicePrincipal): Promise<AccessToken> {
  return getSpAccessToken(sp, ARM_SCOPE);
}

export async function getGraphToken(sp: ServicePrincipal): Promise<AccessToken> {
  return getSpAccessToken(sp, GRAPH_SCOPE);
}

/**
 * Verify Service Principal creds by minting a token. Throws AzureAuthError
 * with Azure AD's HTTP status if the credentials are invalid.
 */
export async function verifyServicePrincipal(sp: ServicePrincipal): Promise<void> {
  await mintSpToken(sp, ARM_SCOPE);
}
