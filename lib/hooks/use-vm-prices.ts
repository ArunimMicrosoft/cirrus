"use client";

import { useQueries } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import { useSubscriptionStore } from "./use-subscription";

/**
 * Batch-fetch live VM PAYG (and optional RI) hourly prices for many
 * (size, region) pairs. TanStack Query dedups identical queries automatically,
 * so calling this for 200 VMs across 5 sizes and 3 regions produces at most
 * 15 network calls. Results are cached client-side for 24h and server-side
 * via the Workers Cache API for another 24h.
 */
export function useVmPrices(
  pairs: Array<{ size: string; region: string }>,
  includeRi = false,
) {
  const enabled = useSubscriptionStore((s) => Boolean(s.activeId));
  const dedup = Array.from(
    new Map(pairs.map((p) => [`${p.size}|${p.region}`, p])).values(),
  );

  const queries = useQueries({
    queries: dedup.map((p) => ({
      queryKey: ["vm-price", p.size, p.region, includeRi],
      queryFn: () => api.vmPrice(p.size, p.region, includeRi),
      enabled,
      staleTime: 24 * 60 * 60_000,
      gcTime: 24 * 60 * 60_000,
    })),
  });

  const map = new Map<
    string,
    {
      paygHourly: number | null;
      ri1yHourly: number | null;
      ri3yHourly: number | null;
      live: boolean;
      loading: boolean;
    }
  >();

  queries.forEach((q, idx) => {
    const key = `${dedup[idx].size}|${dedup[idx].region}`;
    if (q.data) {
      map.set(key, {
        paygHourly: q.data.payg.rate,
        ri1yHourly: q.data.ri?.ri1y ?? null,
        ri3yHourly: q.data.ri?.ri3y ?? null,
        live: q.data.payg.live,
        loading: false,
      });
    } else {
      map.set(key, {
        paygHourly: null,
        ri1yHourly: null,
        ri3yHourly: null,
        live: false,
        loading: q.isLoading,
      });
    }
  });

  const anyLoading = queries.some((q) => q.isLoading);
  const anyError = queries.some((q) => q.isError);

  return { map, anyLoading, anyError };
}

export const HOURS_PER_MONTH = 730;
