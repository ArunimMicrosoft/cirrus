/**
 * Azure Retail Prices API client.
 *
 * https://learn.microsoft.com/rest/api/cost-management/retail-prices/azure-retail-prices
 *
 * This API is public (no auth) and returns real-time PAYG + Reservation
 * pricing. Results are cached in the Workers Cache API for 24 hours keyed by
 * service+SKU+region.
 */

import { getDefaultCache } from "@/lib/workers-cache";

const PRICES_URL = "https://prices.azure.com/api/retail/prices";
const CACHE_HOST = "https://cache.internal";
const PRICE_CACHE_TTL_SECONDS = 24 * 60 * 60;

interface PricesItem {
  retailPrice: number;
  unitPrice: number;
  armRegionName: string;
  armSkuName: string;
  productName: string;
  meterName: string;
  currencyCode: string;
  unitOfMeasure: string;
  priceType: string; // 'Consumption' | 'Reservation'
  reservationTerm?: string;
}

interface PricesResponse {
  Items: PricesItem[];
  NextPageLink: string | null;
}

/** Fallback VM hourly rates used when the API is unreachable. */
const FALLBACK_VM_RATES: Record<string, number> = {
  B1s: 0.0104,
  B1ms: 0.0207,
  B2s: 0.0416,
  B2ms: 0.0832,
  B4ms: 0.166,
  B8ms: 0.332,
  D2sv3: 0.096,
  D4sv3: 0.192,
  D8sv3: 0.384,
  D16sv3: 0.768,
  D2sv5: 0.096,
  D4sv5: 0.192,
  D8sv5: 0.384,
  D16sv5: 0.768,
  D32sv5: 1.536,
  E2sv3: 0.126,
  E4sv3: 0.252,
  E8sv3: 0.504,
  F2sv2: 0.0846,
  F4sv2: 0.169,
  F8sv2: 0.338,
};

export interface VmRate {
  /** Hourly USD rate */
  rate: number;
  /** true if fetched from the live API, false if fallback estimate */
  live: boolean;
}

function normaliseArmSku(size: string): string {
  const trimmed = size.trim();
  return trimmed.startsWith("Standard_") ? trimmed : `Standard_${trimmed}`;
}

function fallbackVmRate(size: string): VmRate {
  const short = size.replace(/^Standard_/, "").replace(/_/g, "");
  const key = Object.keys(FALLBACK_VM_RATES).find((k) =>
    short.toLowerCase().includes(k.toLowerCase()),
  );
  if (key) return { rate: FALLBACK_VM_RATES[key], live: false };
  // Last-resort: 0.05 * core count
  let cores = 2;
  for (const c of ["32", "16", "8", "4", "2", "1"]) {
    if (short.includes(c)) {
      cores = Number(c);
      break;
    }
  }
  return { rate: 0.05 * cores, live: false };
}

async function fetchPrices(filter: string, signal?: AbortSignal): Promise<PricesItem[]> {
  const url = new URL(PRICES_URL);
  url.searchParams.set("$filter", filter);
  const resp = await fetch(url.toString(), {
    method: "GET",
    headers: { Accept: "application/json" },
    signal,
  });
  if (!resp.ok) return [];
  const data = (await resp.json()) as PricesResponse;
  return data.Items ?? [];
}

/**
 * Fetch the hourly PAYG rate for a VM size in a region. Falls back to a hardcoded
 * table if the API times out or returns nothing.
 */
export async function getVmHourlyRate(
  size: string,
  region: string,
): Promise<VmRate> {
  const armSku = normaliseArmSku(size);
  const cacheKey = new Request(
    `${CACHE_HOST}/prices/vm/${encodeURIComponent(armSku)}/${encodeURIComponent(
      region,
    )}`,
  );
  const cache = getDefaultCache();
  if (cache) {
    const hit = await cache.match(cacheKey);
    if (hit) {
      try {
        return (await hit.json()) as VmRate;
      } catch {
        // ignore
      }
    }
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);
    const filter =
      `serviceName eq 'Virtual Machines' and ` +
      `armSkuName eq '${armSku}' and ` +
      `armRegionName eq '${region}' and ` +
      `priceType eq 'Consumption'`;
    const items = await fetchPrices(filter, controller.signal);
    clearTimeout(timeout);
    for (const item of items) {
      const productLower = item.productName.toLowerCase();
      if (productLower.includes("spot") || productLower.includes("windows")) continue;
      if (item.retailPrice > 0) {
        const result: VmRate = { rate: item.retailPrice, live: true };
        if (cache) {
          await cache.put(
            cacheKey,
            new Response(JSON.stringify(result), {
              headers: {
                "Content-Type": "application/json",
                "Cache-Control": `max-age=${PRICE_CACHE_TTL_SECONDS}`,
              },
            }),
          );
        }
        return result;
      }
    }
  } catch {
    // fall through
  }
  return fallbackVmRate(size);
}

export interface RiRates {
  ri1y: number | null;
  ri3y: number | null;
  live: boolean;
}

/** Fetch 1-Year and 3-Year Reserved Instance hourly rates for a VM. */
export async function getVmRiRates(size: string, region: string): Promise<RiRates> {
  const armSku = normaliseArmSku(size);
  const cacheKey = new Request(
    `${CACHE_HOST}/prices/ri/${encodeURIComponent(armSku)}/${encodeURIComponent(
      region,
    )}`,
  );
  const cache = getDefaultCache();
  if (cache) {
    const hit = await cache.match(cacheKey);
    if (hit) {
      try {
        return (await hit.json()) as RiRates;
      } catch {
        // ignore
      }
    }
  }

  const result: RiRates = { ri1y: null, ri3y: null, live: false };
  for (const [term, key, hours] of [
    ["1 Year", "ri1y", 8760],
    ["3 Years", "ri3y", 26280],
  ] as const) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 4000);
      const filter =
        `serviceName eq 'Virtual Machines' and ` +
        `armSkuName eq '${armSku}' and ` +
        `armRegionName eq '${region}' and ` +
        `priceType eq 'Reservation' and ` +
        `reservationTerm eq '${term}'`;
      const items = await fetchPrices(filter, controller.signal);
      clearTimeout(timeout);
      for (const item of items) {
        const productLower = item.productName.toLowerCase();
        if (productLower.includes("spot") || productLower.includes("windows")) continue;
        if (item.retailPrice > 0) {
          result[key] = item.retailPrice / hours;
          result.live = true;
          break;
        }
      }
    } catch {
      // ignore
    }
  }

  if (cache) {
    await cache.put(
      cacheKey,
      new Response(JSON.stringify(result), {
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": `max-age=${PRICE_CACHE_TTL_SECONDS}`,
        },
      }),
    );
  }
  return result;
}

/** Approximate monthly cost for a managed disk by tier. */
export function estimateDiskMonthlyCost(skuName: string, sizeGb: number): number {
  if (sizeGb <= 0) return 0;
  const s = (skuName ?? "").toLowerCase();
  if (s.includes("premium")) return sizeGb * 0.135;
  if (s.includes("standardssd")) return sizeGb * 0.075;
  return sizeGb * 0.04;
}

/** Approximate monthly cost for a Standard Public IP address. */
export function estimatePublicIpMonthlyCost(): number {
  return 3.65;
}

/** Approximate monthly cost for a snapshot. */
export function estimateSnapshotMonthlyCost(sizeGb: number): number {
  return Math.max(0, sizeGb * 0.02);
}
