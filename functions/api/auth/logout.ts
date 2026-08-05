/**
 * POST /api/auth/logout
 *
 * Clears the session cookie. Idempotent; safe to call when already logged out.
 */

import { clearSessionCookie } from "@/lib/session";
import { json, methodNotAllowed } from "@/functions/_utils";
import type { Env } from "@/functions/types";

export const onRequest: PagesFunction<Env> = async ({ request }) => {
  if (request.method !== "POST") return methodNotAllowed(["POST"]);
  return json({ authenticated: false }, 200, {
    "Set-Cookie": clearSessionCookie(),
  });
};
