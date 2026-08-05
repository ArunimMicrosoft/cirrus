"use client";

import { create } from "zustand";
import { useQuery } from "@tanstack/react-query";
import { persist } from "zustand/middleware";
import { api } from "@/lib/api-client";
import type { AzureSubscription } from "@/lib/azure/types";

interface SubscriptionState {
  activeId: string | null;
  activeName: string | null;
  setActive: (sub: AzureSubscription | null) => void;
  reset: () => void;
}

export const useSubscriptionStore = create<SubscriptionState>()(
  persist(
    (set) => ({
      activeId: null,
      activeName: null,
      setActive: (sub) =>
        set({
          activeId: sub?.subscriptionId ?? null,
          activeName: sub?.displayName ?? null,
        }),
      reset: () => set({ activeId: null, activeName: null }),
    }),
    { name: "aiu.subscription" },
  ),
);

/** React Query hook to load subscriptions from the backend. */
export function useSubscriptions() {
  const setActive = useSubscriptionStore((s) => s.setActive);
  const activeId = useSubscriptionStore((s) => s.activeId);

  return useQuery({
    queryKey: ["subscriptions"],
    queryFn: async () => {
      const data = await api.subscriptions();
      const list = data.value ?? [];
      // Auto-select the first subscription if none is set or the stored one is missing.
      if (list.length > 0) {
        const found = activeId
          ? list.find((s) => s.subscriptionId === activeId)
          : undefined;
        if (!found) setActive(list[0]);
      } else {
        setActive(null);
      }
      return list;
    },
    staleTime: 5 * 60_000,
  });
}
