/**
 * GET /api/prices/vm?size=Standard_D2sv5&region=eastus[&ri=1]
 *
 * Returns the hourly PAYG (and optionally RI 1Y/3Y) rate for a VM size in a
 * given region. Backed by the Azure Retail Prices API and cached in the
 * Workers Cache API for 24 hours.
 */

import { z } from "zod";
import { getVmHourlyRate, getVmRiRates } from "@/lib/azure/prices";
import { errorJson, json, methodNotAllowed, requireSession } from "@/functions/_utils";
import type { Env } from "@/functions/types";

const querySchema = z.object({
  size: z.string().min(1),
  region: z.string().min(1),
  ri: z.enum(["0", "1"]).optional(),
});

export const onRequest: PagesFunction<Env> = async ({ request, env }) => {
  if (request.method !== "GET") return methodNotAllowed(["GET"]);
  const [, sessionErr] = await requireSession(request, env);
  if (sessionErr) return sessionErr;

  const url = new URL(request.url);
  const parsed = querySchema.safeParse({
    size: url.searchParams.get("size"),
    region: url.searchParams.get("region"),
    ri: url.searchParams.get("ri") ?? undefined,
  });
  if (!parsed.success) {
    return errorJson(parsed.error.issues[0]?.message ?? "Invalid query", 400);
  }

  const { size, region, ri } = parsed.data;

  const [payg, riRates] = await Promise.all([
    getVmHourlyRate(size, region),
    ri === "1" ? getVmRiRates(size, region) : Promise.resolve(null),
  ]);

  return json({
    size,
    region,
    payg: { rate: payg.rate, live: payg.live },
    ri: riRates,
  });
};
