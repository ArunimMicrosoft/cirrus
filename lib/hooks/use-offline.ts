"use client";

/**
 * Offline / File mode store. Holds the parsed estate from an uploaded ARM /
 * Terraform file. When set, the api-client serves ARM reads from it instead of
 * hitting Azure, and the app treats the user as "authenticated" against a
 * synthetic subscription.
 *
 * Persisted to sessionStorage so a refresh keeps the estate for the tab, but
 * it never leaves the browser and clears when the tab closes.
 */

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { useStore } from "zustand";
import type { ParsedEstate } from "@/lib/offline/estate";

interface OfflineState {
  estate: ParsedEstate | null;
  enter: (estate: ParsedEstate) => void;
  exit: () => void;
}

export const offlineStore = create<OfflineState>()(
  persist(
    (set) => ({
      estate: null,
      enter: (estate) => set({ estate }),
      exit: () => set({ estate: null }),
    }),
    {
      name: "aiu.offline",
      storage: createJSONStorage(() => sessionStorage),
    },
  ),
);

/** Non-hook accessor for use inside the api-client. */
export function getOfflineEstate(): ParsedEstate | null {
  return offlineStore.getState().estate;
}

/** Reactive hook — true when an uploaded file is the active data source. */
export function useIsOffline(): boolean {
  return useStore(offlineStore, (s) => s.estate !== null);
}

export function useOfflineEstate(): ParsedEstate | null {
  return useStore(offlineStore, (s) => s.estate);
}

/** True when the active data source is the built-in demo (all pages enabled). */
export function useIsDemo(): boolean {
  return useStore(offlineStore, (s) => s.estate?.demo === true);
}

export function useOfflineActions() {
  return useStore(offlineStore, (s) => ({ enter: s.enter, exit: s.exit }));
}
