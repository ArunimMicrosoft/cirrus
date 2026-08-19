"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { Sparkles, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { buildSampleEstate } from "@/lib/offline/sample-estate";
import { offlineSubscription } from "@/lib/offline/estate";
import { offlineStore } from "@/lib/hooks/use-offline";
import { useSubscriptionStore } from "@/lib/hooks/use-subscription";

/**
 * One-click entry into the no-login demo: loads the bundled synthetic estate
 * into File mode and jumps to the topology view. Nothing is sent anywhere.
 */
export function DemoButton({
  variant = "solid",
  className,
  label = "Explore the live demo — no login",
}: {
  variant?: "solid" | "ghost";
  className?: string;
  label?: string;
}) {
  const router = useRouter();
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);

  const enterDemo = () => {
    setBusy(true);
    // Defer so the spinner paints before the (synchronous) parse.
    setTimeout(() => {
      const estate = buildSampleEstate();
      offlineStore.getState().enter(estate);
      useSubscriptionStore.getState().setActive(offlineSubscription(estate));
      qc.setQueryData(["auth", "me"], { authenticated: true, type: "sp", tenantId: "file" });
      qc.invalidateQueries({ queryKey: ["subscriptions"] });
      router.push("/intelligence/topology");
    }, 0);
  };

  return (
    <button
      type="button"
      onClick={enterDemo}
      disabled={busy}
      className={cn(
        "inline-flex items-center justify-center gap-1.5 rounded-md px-3 py-2.5 text-[12px] font-semibold transition-colors disabled:opacity-70",
        variant === "solid"
          ? "bg-primary text-primary-foreground hover:bg-primary/90"
          : "border bg-card/60 text-foreground hover:bg-card",
        className,
      )}
    >
      {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
      {busy ? "Loading demo…" : label}
    </button>
  );
}
