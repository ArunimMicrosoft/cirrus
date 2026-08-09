"use client";

import { Home, Globe2 } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  useSubscriptions,
  useSubscriptionStore,
} from "@/lib/hooks/use-subscription";
import { Skeleton } from "@/components/ui/skeleton";

export function SubscriptionPicker() {
  const { data: subs = [], isLoading, isError, error } = useSubscriptions();
  const activeId = useSubscriptionStore((s) => s.activeId);
  const setActive = useSubscriptionStore((s) => s.setActive);

  if (isLoading) {
    return <Skeleton className="h-9 w-full max-w-[280px]" />;
  }
  if (isError) {
    return (
      <div className="text-xs text-destructive" title={String(error)}>
        Failed to load subscriptions
      </div>
    );
  }
  if (subs.length === 0) {
    return (
      <div className="text-xs text-muted-foreground">No subscriptions found</div>
    );
  }

  return (
    <Select
      value={activeId ?? undefined}
      onValueChange={(value) => {
        const found = subs.find((s) => s.subscriptionId === value);
        if (found) setActive(found);
      }}
    >
      <SelectTrigger
        className="w-full max-w-[calc(100vw-8rem)] md:max-w-none md:w-72"
        aria-label="Active subscription"
      >
        <SelectValue placeholder="Select subscription" />
      </SelectTrigger>
      <SelectContent>
        {subs.map((sub) => (
          <SelectItem key={sub.subscriptionId} value={sub.subscriptionId}>
            <div className="flex items-center gap-2">
              {sub.isHome ? (
                <Home className="h-3.5 w-3.5 text-primary" aria-label="HOME tenant" />
              ) : (
                <Globe2
                  className="h-3.5 w-3.5 text-warning"
                  aria-label="Delegated (Lighthouse) tenant"
                />
              )}
              <span className="max-w-[220px] truncate">{sub.displayName}</span>
              <span className="ml-1 text-[10px] text-muted-foreground">
                {sub.subscriptionId.slice(0, 8)}
              </span>
            </div>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
