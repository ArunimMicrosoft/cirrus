/**
 * Azure AD authentication helpers.
 *
 * Implements the client-credentials OAuth 2.0 flow against
 * https://login.microsoftonline.com/{tenant}/oauth2/v2.0/token for a
 * Service Principal.
 *
 * Access tokens are cached in the Workers Cache API keyed by tenant+client so
 * concurrent Function invocations share one token instead of minting one per request.
 */

export interface ServicePrincipal {
  tenantId: string;
  clientId: string;
  clientSecret: string;
}

export interface AccessToken {
  token: string;
  /** Absolute expiry as epoch milliseconds */
  expiresAt: number;
}

const ARM_SCOPE = "https://management.azure.com/.default";
const GRAPH_SCOPE = "https://graph.microsoft.com/.default";
const CACHE_HOST = "https://cache.internal";
// Refresh tokens 5 minutes before they actually expire to avoid clock skew races.
const RENEW_BEFORE_MS = 5 * 60 * 1000;

import { getDefaultCache } from "@/lib/workers-cache";

async function hashKey(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function cacheKeyFor(sp: ServicePrincipal, scope: string, hash: string): Request {
  return new Request(
    `${CACHE_HOST}/token/${sp.tenantId}/${sp.clientId}/${encodeURIComponent(scope)}/${hash}`,
  );
}

async function mintToken(sp: ServicePrincipal, scope: string): Promise<AccessToken> {
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

/**
 * Get a valid access token for the given SP+scope. Uses the Workers Cache API
 * to memoize across requests. When the caches global is not available (some
 * dev environments), we fall back to always minting.
 */
export async function getAccessToken(
  sp: ServicePrincipal,
  opts: { scope?: string } = {},
): Promise<AccessToken> {
  const scope = opts.scope ?? ARM_SCOPE;
  const spHash = await hashKey(`${sp.tenantId}|${sp.clientId}|${sp.clientSecret}`);
  const cache = getDefaultCache();
  const key = cacheKeyFor(sp, scope, spHash);

  if (cache) {
    const hit = await cache.match(key);
    if (hit) {
      try {
        const cached = (await hit.json()) as AccessToken;
        if (cached.expiresAt - RENEW_BEFORE_MS > Date.now()) {
          return cached;
        }
      } catch {
        // ignore parse errors and re-mint
      }
    }
  }

  const fresh = await mintToken(sp, scope);
  if (cache) {
    const ttlSeconds = Math.max(
      60,
      Math.floor((fresh.expiresAt - Date.now() - RENEW_BEFORE_MS) / 1000),
    );
    await cache.put(
      key,
      new Response(JSON.stringify(fresh), {
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": `max-age=${ttlSeconds}`,
        },
      }),
    );
  }
  return fresh;
}

export async function getArmToken(sp: ServicePrincipal): Promise<AccessToken> {
  return getAccessToken(sp, { scope: ARM_SCOPE });
}

export async function getGraphToken(sp: ServicePrincipal): Promise<AccessToken> {
  return getAccessToken(sp, { scope: GRAPH_SCOPE });
}

export class AzureAuthError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "AzureAuthError";
    this.status = status;
  }
}

/**
 * Verify a Service Principal by attempting to mint a token. Throws AzureAuthError
 * with the HTTP status from Azure AD if the credentials are invalid.
 */
export async function verifyServicePrincipal(sp: ServicePrincipal): Promise<void> {
  await mintToken(sp, ARM_SCOPE);
}
