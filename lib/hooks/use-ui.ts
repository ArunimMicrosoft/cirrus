/**
 * Global UI state — right now just tracks whether the mobile nav drawer
 * is open. Zustand instead of React context so the two consumers
 * (AppLayout + TopBar hamburger) don't force re-renders of the whole tree.
 */

import { create } from "zustand";

interface UiState {
  mobileNavOpen: boolean;
  openMobileNav: () => void;
  closeMobileNav: () => void;
  toggleMobileNav: () => void;
}

export const useUiStore = create<UiState>((set) => ({
  mobileNavOpen: false,
  openMobileNav: () => set({ mobileNavOpen: true }),
  closeMobileNav: () => set({ mobileNavOpen: false }),
  toggleMobileNav: () => set((s) => ({ mobileNavOpen: !s.mobileNavOpen })),
}));
