"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuthState } from "@/lib/hooks/use-auth";
import { Loader2 } from "lucide-react";

/**
 * Redirects unauthenticated visitors to `/` (login page). Renders children
 * only when the auth check has succeeded. Handles the static-export flow
 * where auth state is only known after the first client-side fetch.
 */
export function AuthGate({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { data, isLoading, isError } = useAuthState();

  useEffect(() => {
    if (!isLoading && (isError || !data?.authenticated)) {
      router.replace("/");
    }
  }, [data, isError, isLoading, router]);

  if (isLoading || !data?.authenticated) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Checking session…
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
