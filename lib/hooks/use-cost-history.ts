"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import { useSubscriptionStore } from "@/lib/hooks/use-subscription";
import {
  parseCostQuery,
  type CostQueryResponse,
  type CostSeries,
} from "@/lib/cost/costquery";

/**
 * Real daily spend history for the active subscription, straight from Azure
 * Cost Management (actual billed cost). This is the authoritative series the
 * spend forecast is built on — available on the first login, from any device,
 * with no waiting for browser history to accumulate.
 *
 * Requires the "Cost Management Reader" role on the sign-in identity. When
 * it's missing, Azure returns 403 and we surface a precise, actionable error
 * rather than an empty chart.
 */
export function useCostHistory(days = 90) {
  const activeId = useSubscriptionStore((s) => s.activeId);

  const query = useQuery({
    queryKey: ["cost-history", activeId, days],
    enabled: Boolean(activeId),
    staleTime: 6 * 60 * 60_000, // cost data updates a few times a day at most
    refetchOnWindowFocus: false,
    // Cost Management is aggressively rate-limited (429). Back off and retry a
    // few times only for 429s; the server also caches, so a later attempt hits
    // cache. Don't retry auth/permission errors.
    retry: (failureCount, err) => {
      const msg = (err as Error)?.message ?? "";
      return /\b429\b|too many requests|rate/i.test(msg) && failureCount < 3;
    },
    retryDelay: (attempt) => Math.min(12_000, 2_000 * 2 ** attempt),
    queryFn: async (): Promise<CostSeries> => {
      const to = new Date();
      const from = new Date(to.getTime() - days * 24 * 60 * 60 * 1000);
      const resp = await api.cost<CostQueryResponse>(
        activeId as string,
        from.toISOString(),
        to.toISOString(),
        "Daily",
      );
      return parseCostQuery(resp);
    },
  });

  const error = query.error as Error | null;
  // A permissions gap is the one error worth calling out specifically.
  const needsRole =
    !!error && /\b(401|403|authoriz|forbidden|permission)\b/i.test(error.message);
  // Azure Cost Management rate limit — transient, clears on its own.
  const rateLimited =
    !!error && /\b429\b|too many requests|rate limit/i.test(error.message);

  return {
    series: query.data ?? null,
    isLoading: query.isLoading || query.isFetching,
    isError: query.isError,
    error,
    needsRole,
    rateLimited,
    refetch: query.refetch,
  };
}
