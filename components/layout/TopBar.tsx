"use client";

import { useRouter } from "next/navigation";
import { Globe2, Home, LogOut, Menu, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SubscriptionPicker } from "./SubscriptionPicker";
import { useAuthState, useLogout } from "@/lib/hooks/use-auth";
import { useUiStore } from "@/lib/hooks/use-ui";
import { ThemeToggle } from "./ThemeToggle";

export function TopBar() {
  const { data: auth } = useAuthState();
  const logout = useLogout();
  const router = useRouter();
  const toggleMobileNav = useUiStore((s) => s.toggleMobileNav);

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center justify-between gap-2 border-b bg-background/85 px-3 backdrop-blur-md md:gap-4 md:px-6">
      <div className="flex min-w-0 items-center gap-2 md:gap-3">
        {/* Mobile hamburger — hidden on desktop where the sidebar is always visible. */}
        <Button
          variant="ghost"
          size="icon"
          className="md:hidden"
          onClick={toggleMobileNav}
          aria-label="Open navigation"
        >
          <Menu className="h-5 w-5" />
        </Button>
        <SubscriptionPicker />
      </div>

      <div className="flex items-center gap-2">
        <div className="hidden items-center gap-1.5 rounded-full border border-emerald-500/25 bg-emerald-500/8 px-2.5 py-0.5 text-[10.5px] font-semibold uppercase tracking-[0.11em] text-emerald-700 dark:text-emerald-400 md:inline-flex">
          <ShieldCheck className="h-3 w-3" />
          Read-only
        </div>

        <ThemeToggle />

        {auth?.authenticated && (
          <>
            <div className="hidden items-center gap-1.5 rounded-md border bg-card/60 px-2.5 py-1 text-[11px] font-medium text-muted-foreground md:flex">
              {auth.lighthouse ? (
                <Globe2 className="h-3 w-3 text-amber-500" />
              ) : (
                <Home className="h-3 w-3 text-primary" />
              )}
              <span className="max-w-[120px] truncate font-mono">
                {auth.tenantId?.slice(0, 8)}
              </span>
              {auth.lighthouse && (
                <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-amber-700 dark:text-amber-400">
                  Lighthouse
                </span>
              )}
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={async () => {
                await logout.mutateAsync();
                router.push("/");
              }}
              disabled={logout.isPending}
            >
              <LogOut className="h-4 w-4" />
              <span className="hidden md:inline">Logout</span>
            </Button>
          </>
        )}
      </div>
    </header>
  );
}
