/**
 * Encrypted session cookie for Cloudflare Pages Functions.
 *
 * Stores Service Principal credentials in an HttpOnly, Secure, SameSite=Lax cookie.
 * AES-GCM authenticated encryption (integrity + confidentiality) using a 256-bit
 * key derived from SESSION_SECRET via SHA-256.
 *
 * Payload is small (< 500 bytes) and stays well under the 4 KB cookie limit.
 */

export const SESSION_COOKIE = "aiu_session";
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 8; // 8 hours

export interface SessionPayload {
  /** HOME / MSP tenant ID */
  tenantId: string;
  /** Service Principal application (client) ID */
  clientId: string;
  /** Service Principal client secret (encrypted at rest in the cookie) */
  clientSecret: string;
  /** Whether Azure Lighthouse mode is enabled */
  lighthouse: boolean;
  /** ISO timestamp of when this session was created */
  createdAt: string;
}

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

/** Decrypt a session cookie value. Returns null on any tampering or key mismatch. */
export async function decryptSession(
  token: string | null | undefined,
  secret: string,
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
    const parsed = JSON.parse(decoder.decode(plaintext)) as SessionPayload;
    if (!parsed.tenantId || !parsed.clientId || !parsed.clientSecret) {
      return null;
    }
    return parsed;
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
): Promise<SessionPayload | null> {
  const cookies = parseCookies(request.headers.get("Cookie"));
  return decryptSession(cookies[SESSION_COOKIE], secret);
}
