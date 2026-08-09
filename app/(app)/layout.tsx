"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { Sidebar } from "@/components/layout/Sidebar";
import { TopBar } from "@/components/layout/TopBar";
import { AuthGate } from "@/components/layout/AuthGate";
import { useUiStore } from "@/lib/hooks/use-ui";
import { cn } from "@/lib/utils";

/**
 * Post-login app shell.
 *
 * On desktop the sidebar is a static column; on mobile it's a drawer that
 * slides in from the left over a backdrop, opened by the hamburger button
 * on the TopBar and closed on route change or backdrop tap.
 */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  const mobileNavOpen = useUiStore((s) => s.mobileNavOpen);
  const closeMobileNav = useUiStore((s) => s.closeMobileNav);
  const pathname = usePathname();

  // Close the drawer whenever the route changes so tapping a nav link
  // dismisses it. We use pathname as the effect key rather than wiring a
  // callback into every Sidebar link.
  useEffect(() => {
    closeMobileNav();
  }, [pathname, closeMobileNav]);

  // Prevent body scroll while the drawer is open (avoids the awkward
  // "underlying page moves while drawer is open" flicker on iOS).
  useEffect(() => {
    if (typeof document === "undefined") return;
    document.body.style.overflow = mobileNavOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [mobileNavOpen]);

  // Escape closes the drawer.
  useEffect(() => {
    if (!mobileNavOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeMobileNav();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mobileNavOpen, closeMobileNav]);

  return (
    <AuthGate>
      <div className="flex h-screen w-full overflow-hidden bg-background">
        {/* Desktop sidebar — always visible ≥ md */}
        <Sidebar className="hidden md:flex" />

        {/* Mobile drawer + backdrop */}
        <div
          role="presentation"
          className={cn(
            "fixed inset-0 z-40 bg-foreground/40 backdrop-blur-sm transition-opacity md:hidden",
            mobileNavOpen ? "opacity-100" : "pointer-events-none opacity-0",
          )}
          onClick={closeMobileNav}
          aria-hidden="true"
        />
        <div
          aria-hidden={!mobileNavOpen}
          className={cn(
            "fixed inset-y-0 left-0 z-50 w-72 max-w-[85vw] transform shadow-2xl transition-transform duration-200 md:hidden",
            mobileNavOpen ? "translate-x-0" : "-translate-x-full",
          )}
        >
          <Sidebar className="flex h-full" />
        </div>

        <div className="flex min-w-0 flex-1 flex-col">
          <TopBar />
          <main className="flex-1 overflow-y-auto">
            <div className="mx-auto w-full max-w-7xl animate-fade-in space-y-6 px-4 py-5 md:px-6 md:py-6">
              {children}
            </div>
          </main>
        </div>
      </div>
    </AuthGate>
  );
}
