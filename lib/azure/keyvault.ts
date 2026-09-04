/**
 * Thin Azure Key Vault DATA-PLANE REST client used by CF Pages Functions.
 *
 * Keys, secrets and certificates are NOT exposed on the ARM management plane —
 * they live on each vault's own endpoint (`https://{vault}.vault.azure.net`)
 * and require a token for the `https://vault.azure.net` audience plus a
 * data-plane role/access-policy on the vault.
 *
 * All operations here are strictly read-only GET list calls. We never fetch a
 * secret/key VALUE — only the object metadata (attributes: enabled, created,
 * updated, exp, nbf), which is what the expiry/rotation views need.
 */

/** Key Vault data-plane API version (stable). */
export const KEYVAULT_DATA_API = "7.4";

export type KeyVaultObjectKind = "keys" | "secrets" | "certificates";

export const KEYVAULT_KINDS: readonly KeyVaultObjectKind[] = [
  "keys",
  "secrets",
  "certificates",
] as const;

export class KeyVaultError extends Error {
  status: number;
  body: string;
  constructor(message: string, status: number, body: string) {
    super(message);
    this.name = "KeyVaultError";
    this.status = status;
    this.body = body;
  }
}

/** Hosts we are willing to proxy to. Covers public + sovereign clouds. */
const VAULT_HOST_RE =
  /^[a-z0-9][a-z0-9-]{1,126}\.vault(\.azure\.net|\.azure\.cn|\.usgovcloudapi\.net|\.microsoftazure\.de)$/i;

/**
 * Validate and normalise a caller-supplied vault URI to its origin
 * (`https://name.vault.azure.net`). Throws KeyVaultError(400) on anything that
 * is not a well-formed vault endpoint — this is the SSRF guard for the proxy.
 */
export function normaliseVaultOrigin(rawVaultUri: string): string {
  let url: URL;
  try {
    url = new URL(rawVaultUri);
  } catch {
    throw new KeyVaultError("Invalid vault URI", 400, "");
  }
  if (url.protocol !== "https:" || !VAULT_HOST_RE.test(url.hostname)) {
    throw new KeyVaultError(
      "vault must be an https://<name>.vault.azure.net URI",
      400,
      "",
    );
  }
  return url.origin;
}

export interface KeyVaultObjectAttributes {
  enabled?: boolean;
  /** Creation ("commission") time as epoch SECONDS. */
  created?: number;
  /** Last update time as epoch SECONDS. */
  updated?: number;
  /** Expiry time as epoch SECONDS. */
  exp?: number;
  /** Not-before time as epoch SECONDS. */
  nbf?: number;
  recoveryLevel?: string;
}

export interface KeyVaultDataItem {
  /** Object identifier URL. `kid` for keys, `id` for secrets/certificates. */
  kid?: string;
  id?: string;
  attributes?: KeyVaultObjectAttributes;
  tags?: Record<string, string> | null;
  /** Secrets only. */
  contentType?: string;
  /** Secrets only — true when the secret backs a certificate. */
  managed?: boolean;
  /** Certificates only — base64url SHA-1 thumbprint. */
  x5t?: string;
}

/**
 * List all objects of one kind in a vault, walking `nextLink` pagination.
 * `vaultOrigin` must already be validated via normaliseVaultOrigin().
 */
export async function listVaultObjects(
  token: string,
  vaultOrigin: string,
  kind: KeyVaultObjectKind,
  opts: { signal?: AbortSignal } = {},
): Promise<KeyVaultDataItem[]> {
  const results: KeyVaultDataItem[] = [];
  let nextUrl: string | null = `${vaultOrigin}/${kind}?api-version=${KEYVAULT_DATA_API}`;

  // Hard cap on pages to avoid pathological loops on a hostile nextLink.
  let guard = 0;
  while (nextUrl && guard < 100) {
    guard += 1;
    const resp: Response = await fetch(nextUrl, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
      },
      signal: opts.signal,
    });
    if (!resp.ok) {
      const text = await resp.text().catch(() => "");
      throw new KeyVaultError(
        `Key Vault ${resp.status} on ${kind}: ${text.slice(0, 400)}`,
        resp.status,
        text,
      );
    }
    const page = (await resp.json()) as {
      value?: KeyVaultDataItem[];
      nextLink?: string;
    };
    if (Array.isArray(page.value)) results.push(...page.value);
    // nextLink is an absolute URL back to the same vault host; trust it only
    // if it points at the same origin we validated.
    if (page.nextLink) {
      try {
        const nl = new URL(page.nextLink);
        nextUrl = nl.origin === vaultOrigin ? page.nextLink : null;
      } catch {
        nextUrl = null;
      }
    } else {
      nextUrl = null;
    }
  }
  return results;
}
