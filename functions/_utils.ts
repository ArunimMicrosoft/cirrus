/**
 * Shared helpers used by every Pages Function.
 */

import { readSession, type SessionPayload } from "@/lib/session";
import type { Env } from "./types";

export function json(
  data: unknown,
  init: number | ResponseInit = 200,
  extraHeaders?: HeadersInit,
): Response {
  const responseInit: ResponseInit =
    typeof init === "number" ? { status: init } : init;
  return new Response(JSON.stringify(data), {
    ...responseInit,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      ...(responseInit.headers ?? {}),
      ...(extraHeaders ?? {}),
    },
  });
}

export function errorJson(message: string, status = 400): Response {
  return json({ error: message }, status);
}

/**
 * Load the session payload or return an unauthorized response.
 * Usage: `const [session, err] = await requireSession(request, env); if (err) return err;`
 */
export async function requireSession(
  request: Request,
  env: Env,
): Promise<[SessionPayload, null] | [null, Response]> {
  if (!env.SESSION_SECRET) {
    return [null, errorJson("SESSION_SECRET is not configured on the server", 500)];
  }
  const session = await readSession(
    request,
    env.SESSION_SECRET,
    env.SESSION_EPOCH,
  );
  if (!session) {
    return [null, errorJson("Not authenticated", 401)];
  }
  return [session, null];
}

/** Return a 405 with the allowed methods header. */
export function methodNotAllowed(allowed: string[]): Response {
  return new Response(JSON.stringify({ error: "Method not allowed" }), {
    status: 405,
    headers: {
      "Content-Type": "application/json",
      Allow: allowed.join(", "),
    },
  });
}
