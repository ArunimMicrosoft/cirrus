"use client";

import { useQuery, type UseQueryOptions, type QueryKey } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import { useSubscriptionStore } from "./use-subscription";

interface ExtraOpts<T> extends Partial<UseQueryOptions<T>> {
  /** Override the auto-generated query key. Useful for windowed queries. */
  queryKey?: QueryKey;
  /** Extra ARM query params, e.g. { "$filter": "eventTimestamp ge '...'" }. */
  params?: Record<string, string | number | undefined>;
}

/**
 * Fetch a paginated ARM list endpoint for the currently active subscription.
 * The query is disabled until an active subscription is chosen.
 */
export function useArmList<T>(
  armPath: string,
  apiVersion: string,
  opts: ExtraOpts<{ value: T[] }> = {},
) {
  const subId = useSubscriptionStore((s) => s.activeId);
  const { queryKey: overrideKey, params, ...restOpts } = opts;
  return useQuery<{ value: T[] }>({
    queryKey: overrideKey ?? ["arm", subId, armPath, apiVersion, params],
    queryFn: () => {
      if (!subId) throw new Error("No active subscription");
      return api.armList<T>(subId, armPath, apiVersion, params);
    },
    enabled: Boolean(subId),
    staleTime: 60_000,
    ...restOpts,
  });
}

/** Fetch a single ARM resource (GET) for the active subscription. */
export function useArm<T>(
  armPath: string,
  apiVersion: string,
  opts: ExtraOpts<T> = {},
) {
  const subId = useSubscriptionStore((s) => s.activeId);
  const { queryKey: overrideKey, params, ...restOpts } = opts;
  return useQuery<T>({
    queryKey: overrideKey ?? ["arm-single", subId, armPath, apiVersion, params],
    queryFn: () => {
      if (!subId) throw new Error("No active subscription");
      return api.arm<T>(subId, armPath, apiVersion, params);
    },
    enabled: Boolean(subId),
    staleTime: 60_000,
    ...restOpts,
  });
}
