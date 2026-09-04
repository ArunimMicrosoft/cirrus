/**
 * GET /api/keyvault?vault=<vaultUri>&kind=keys|secrets|certificates
 *
 * Key Vault DATA-PLANE read proxy. Lists object metadata (NOT values) from a
 * single vault's endpoint (`https://{name}.vault.azure.net`).
 *
 * ==================================================================
 * WHY THIS IS A SEPARATE PROXY FROM /api/arm
 * ==================================================================
 * Keys/secrets/certificates are not ARM resources — they are served by each
 * vault's own data-plane endpoint and require a token for the
 * `https://vault.azure.net` audience (getVaultTokenForSession), which is
 * distinct from the ARM audience the /api/arm proxy uses.
 *
 * Read-only guarantees:
 *   - GET only (any other verb → 405).
 *   - The `vault` param is validated to a real *.vault.azure.net origin before
 *     any outbound call (SSRF guard in normaliseVaultOrigin).
 *   - We only call list endpoints (/keys, /secrets, /certificates), which
 *     return metadata. We never request a secret/key VALUE.
 * ==================================================================
 */

import { getVaultTokenForSession } from "@/lib/azure/auth";
import {
  KEYVAULT_KINDS,
  KeyVaultError,
  listVaultObjects,
  normaliseVaultOrigin,
  type KeyVaultObjectKind,
} from "@/lib/azure/keyvault";
import { errorJson, json, methodNotAllowed, requireSession } from "@/functions/_utils";
import type { Env } from "@/functions/types";

export const onRequest: PagesFunction<Env> = async ({ request, env }) => {
  if (request.method !== "GET") return methodNotAllowed(["GET"]);

  const [session, sessionErr] = await requireSession(request, env);
  if (sessionErr) return sessionErr;

  const url = new URL(request.url);
  const vault = url.searchParams.get("vault");
  const kind = url.searchParams.get("kind") as KeyVaultObjectKind | null;

  if (!vault) return errorJson("vault query parameter is required", 400);
  if (!kind || !KEYVAULT_KINDS.includes(kind)) {
    return errorJson("kind must be one of keys, secrets, certificates", 400);
  }

  let origin: string;
  try {
    origin = normaliseVaultOrigin(vault);
  } catch (e) {
    if (e instanceof KeyVaultError) return errorJson(e.message, e.status);
    return errorJson("Invalid vault URI", 400);
  }

  try {
    const { token } = await getVaultTokenForSession(session);
    const value = await listVaultObjects(token, origin, kind);
    return json({ value });
  } catch (e) {
    if (e instanceof KeyVaultError) {
      return errorJson(e.message, e.status);
    }
    return errorJson(e instanceof Error ? e.message : String(e), 500);
  }
};
