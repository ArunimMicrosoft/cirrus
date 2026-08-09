/**
 * Encrypted session cookie for Cloudflare Pages Functions.
 *
 * Stores one of two auth payloads in an HttpOnly, Secure, SameSite=Lax cookie:
 *
 *   type "sp"     — Service Principal (client_credentials flow)
 *   type "device" — Delegated user token acquired via OAuth 2.0 Device Code
 *
 * AES-GCM authenticated encryption (integrity + confidentiality) using a
 * 256-bit key derived from SESSION_SECRET via SHA-256. Payload stays under
 * ~2 KB even with a full refresh_token, well within the 4 KB cookie limit.
 */

export const SESSION_COOKIE = "aiu_session";
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 4; // 4 hours

/**
 * Default cookie "generation" (aka epoch). Any session created before the
 * currently-configured epoch is treated as invalid. Bump the SESSION_EPOCH
 * env var on the deployment to sign every user out on demand — no need to
 * rotate the encryption key.
 */
const DEFAULT_EPOCH = "1";

/** Service Principal (client_credentials) session — created by /api/auth/login. */
export interface SpSessionPayload {
  type: "sp";
  /** HOME / MSP tenant ID */
  tenantId: string;
  /** Service Principal application (client) ID */
  clientId: string;
  /** Service Principal client secret */
  clientSecret: string;
  /** Whether Azure Lighthouse mode is enabled */
  lighthouse: boolean;
  /** ISO timestamp of when this session was created */
  createdAt: string;
  /** Cookie generation. Must match env.SESSION_EPOCH to be accepted. */
  epoch?: string;
}

/** Delegated user session — created by /api/auth/device/poll on success. */
export interface DeviceSessionPayload {
  type: "device";
  /** User's home tenant (extracted from the returned token's tid claim). */
  tenantId: string;
  /** Multi-tenant app client ID that owns this session (AZURE_AD_CLIENT_ID). */
  clientId: string;
  /** Long-lived refresh token — used to mint fresh ARM tokens as needed. */
  refreshToken: string;
  /** Optional: display name from the id token. */
  name?: string;
  /** Optional: preferred_username / UPN. */
  username?: string;
  /** Whether Azure Lighthouse mode is enabled (delegated subs). */
  lighthouse: boolean;
  /** ISO timestamp of when this session was created */
  createdAt: string;
  /** Cookie generation. Must match env.SESSION_EPOCH to be accepted. */
  epoch?: string;
}

export type SessionPayload = SpSessionPayload | DeviceSessionPayload;

const encoder = new TextEncoder();
const decoder = new TextDecoder();

async function deriveKey(secret: string): Promise<CryptoKey> {
  const raw = await crypto.subtle.digest("SHA-256", encoder.encode(secret));
  return crypto.subtle.importKey("raw", raw, { name: "AES-GCM" }, false, [
    "encrypt",
    "decrypt",
  ]);
}

function toBase64Url(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(input: string): Uint8Array {
  const b64 = input.replace(/-/g, "+").replace(/_/g, "/");
  const pad = b64.length % 4 === 0 ? "" : "=".repeat(4 - (b64.length % 4));
  const bin = atob(b64 + pad);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** Encrypt a session payload for storage in a cookie. */
export async function encryptSession(
  payload: SessionPayload,
  secret: string,
): Promise<string> {
  if (!secret || secret.length < 16) {
    throw new Error("SESSION_SECRET must be set and at least 16 characters");
  }
  const key = await deriveKey(secret);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const plaintext = encoder.encode(JSON.stringify(payload));
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, plaintext),
  );
  const combined = new Uint8Array(iv.length + ciphertext.length);
  combined.set(iv, 0);
  combined.set(ciphertext, iv.length);
  return toBase64Url(combined);
}

/**
 * Decrypt a session cookie value. Returns null on any tampering, key
 * mismatch, or epoch mismatch. Legacy sessions (from pre-0.2.0 builds)
 * do NOT carry a `type` field — they are treated as "sp" for backward
 * compatibility.
 *
 * `currentEpoch` is the value of env.SESSION_EPOCH on the server. Bumping
 * that value in the Cloudflare dashboard immediately invalidates every
 * previously issued cookie without changing the encryption key.
 */
export async function decryptSession(
  token: string | null | undefined,
  secret: string,
  currentEpoch: string = DEFAULT_EPOCH,
): Promise<SessionPayload | null> {
  if (!token || !secret) return null;
  try {
    const combined = fromBase64Url(token);
    if (combined.length < 13) return null;
    const iv = combined.slice(0, 12);
    const ciphertext = combined.slice(12);
    const key = await deriveKey(secret);
    const plaintext = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv },
      key,
      ciphertext,
    );
    const parsed = JSON.parse(decoder.decode(plaintext)) as Record<string, unknown>;

    // Epoch check. Sessions with no epoch (legacy) are treated as epoch "1".
    const sessionEpoch = typeof parsed.epoch === "string" ? parsed.epoch : DEFAULT_EPOCH;
    if (sessionEpoch !== currentEpoch) return null;

    // Discriminate by explicit type, defaulting to "sp" for legacy payloads.
    const type = parsed.type === "device" ? "device" : "sp";
    if (type === "device") {
      if (
        typeof parsed.tenantId !== "string" ||
        typeof parsed.clientId !== "string" ||
        typeof parsed.refreshToken !== "string"
      ) {
        return null;
      }
      return {
        type: "device",
        tenantId: parsed.tenantId,
        clientId: parsed.clientId,
        refreshToken: parsed.refreshToken,
        name: typeof parsed.name === "string" ? parsed.name : undefined,
        username:
          typeof parsed.username === "string" ? parsed.username : undefined,
        lighthouse: Boolean(parsed.lighthouse),
        createdAt:
          typeof parsed.createdAt === "string"
            ? parsed.createdAt
            : new Date().toISOString(),
        epoch: sessionEpoch,
      };
    }

    // "sp" branch (or legacy).
    if (
      typeof parsed.tenantId !== "string" ||
      typeof parsed.clientId !== "string" ||
      typeof parsed.clientSecret !== "string"
    ) {
      return null;
    }
    return {
      type: "sp",
      tenantId: parsed.tenantId,
      clientId: parsed.clientId,
      clientSecret: parsed.clientSecret,
      lighthouse: Boolean(parsed.lighthouse),
      createdAt:
        typeof parsed.createdAt === "string"
          ? parsed.createdAt
          : new Date().toISOString(),
      epoch: sessionEpoch,
    };
  } catch {
    return null;
  }
}

/** Build a Set-Cookie header value for the session. */
export function buildSessionCookie(value: string): string {
  return [
    `${SESSION_COOKIE}=${value}`,
    "HttpOnly",
    "Secure",
    "SameSite=Lax",
    "Path=/",
    `Max-Age=${SESSION_MAX_AGE_SECONDS}`,
  ].join("; ");
}

/** Build a Set-Cookie header value that clears the session. */
export function clearSessionCookie(): string {
  return [
    `${SESSION_COOKIE}=`,
    "HttpOnly",
    "Secure",
    "SameSite=Lax",
    "Path=/",
    "Max-Age=0",
  ].join("; ");
}

/** Parse cookies from a request header into a simple record. */
export function parseCookies(cookieHeader: string | null): Record<string, string> {
  if (!cookieHeader) return {};
  const out: Record<string, string> = {};
  for (const part of cookieHeader.split(";")) {
    const idx = part.indexOf("=");
    if (idx === -1) continue;
    const k = part.slice(0, idx).trim();
    const v = part.slice(idx + 1).trim();
    if (k) out[k] = decodeURIComponent(v);
  }
  return out;
}

/** Read the session payload from a Pages Function request. */
export async function readSession(
  request: Request,
  secret: string,
  currentEpoch: string = DEFAULT_EPOCH,
): Promise<SessionPayload | null> {
  const cookies = parseCookies(request.headers.get("Cookie"));
  return decryptSession(cookies[SESSION_COOKIE], secret, currentEpoch);
}

/** The default epoch used when SESSION_EPOCH isn't configured. */
export { DEFAULT_EPOCH };
