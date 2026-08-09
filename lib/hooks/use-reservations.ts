"use client";

import * as React from "react";
import { useArmList } from "@/lib/hooks/use-arm";
import { ArmApi } from "@/lib/azure/arm";
import {
  normaliseReservationRecommendations,
  summariseReservations,
  type RawReservationRecommendation,
} from "@/lib/cost/reservations";

/**
 * Fetch Azure's native reservation purchase recommendations for the active
 * subscription. This is a READ-ONLY GET against Microsoft.Consumption; Azure
 * computes the savings from your real usage, so it is the authoritative source
 * for reservation savings (no list-price estimation).
 *
 * Not every subscription offer supports the Consumption API (e.g. some CSP /
 * sponsored subscriptions return 404). We disable retries and surface the
 * error so callers can fall back to the break-even estimate gracefully.
 */
export function useReservationRecommendations() {
  const query = useArmList<RawReservationRecommendation>(
    "/providers/Microsoft.Consumption/reservationRecommendations",
    ArmApi.consumption,
    {
      retry: false,
      staleTime: 6 * 60 * 60_000, // recommendations refresh at most daily
    },
  );

  const recommendations = React.useMemo(
    () => normaliseReservationRecommendations(query.data?.value ?? []),
    [query.data],
  );

  const summary = React.useMemo(
    () => summariseReservations(recommendations),
    [recommendations],
  );

  return {
    recommendations,
    summary,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error as Error | null,
    /** True when Azure returned at least one actionable recommendation. */
    hasData: recommendations.length > 0,
  };
}
