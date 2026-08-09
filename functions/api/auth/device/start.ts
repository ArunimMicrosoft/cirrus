/**
 * POST /api/auth/device/start
 *
 * Initiates the OAuth 2.0 Device Code flow against Azure AD's /common
 * endpoint (multi-tenant). Returns the user_code and verification_uri the
 * end user needs to visit, plus the device_code the client passes back to
 * /api/auth/device/poll.
 *
 * No cookie is set at this stage — the session is minted only after the
 * user completes authentication and the poll endpoint receives a token.
 *
 * Requires AZURE_AD_CLIENT_ID to be configured on the deployment.
 *
 * Body: { lighthouse?: boolean }  // saved in a short-lived signed state
 */

import { z } from "zod";
import { errorJson, json, methodNotAllowed } from "@/functions/_utils";
import { ARM_DELEGATED_SCOPE } from "@/lib/azure/auth";
import type { Env } from "@/functions/types";

const bodySchema = z.object({
  lighthouse: z.boolean().optional().default(false),
});

interface DeviceCodeResponse {
  user_code: string;
  device_code: string;
  verification_uri: string;
  expires_in: number;
  interval: number;
  message?: string;
}

export const onRequest: PagesFunction<Env> = async ({ request, env }) => {
  if (request.method !== "POST") return methodNotAllowed(["POST"]);

  const clientId = env.AZURE_AD_CLIENT_ID;
  if (!clientId) {
    return errorJson(
      "Device Code sign-in is not configured on this deployment. AZURE_AD_CLIENT_ID must be set to a multi-tenant app registration client ID.",
      501,
    );
  }

  let parsed: z.infer<typeof bodySchema>;
  try {
    const raw = await request.json().catch(() => ({}));
    parsed = bodySchema.parse(raw);
  } catch {
    return errorJson("Invalid JSON body", 400);
  }

  // /common endpoint lets any Azure AD tenant respond. The token that
  // eventually comes back carries a `tid` claim we use as the session tenant.
  const url = "https://login.microsoftonline.com/common/oauth2/v2.0/devicecode";
  const body = new URLSearchParams({
    client_id: clientId,
    scope: ARM_DELEGATED_SCOPE,
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
    return errorJson(
      `Azure AD rejected device code request (${resp.status}): ${text.slice(0, 400)}`,
      resp.status,
    );
  }
  const data = (await resp.json()) as DeviceCodeResponse;

  return json({
    userCode: data.user_code,
    deviceCode: data.device_code,
    verificationUri: data.verification_uri,
    message: data.message,
    expiresIn: data.expires_in,
    interval: Math.max(2, data.interval ?? 5),
    lighthouse: parsed.lighthouse,
  });
};
