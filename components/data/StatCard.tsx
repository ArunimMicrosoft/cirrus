"use client";

import { cn } from "@/lib/utils";

interface StatCardProps {
  label: string;
  value: string | number;
  delta?: string;
  deltaTone?: "default" | "positive" | "negative";
  icon?: React.ReactNode;
  className?: string;
  loading?: boolean;
}

/**
 * Compact KPI card. Designed for grids of 4-6 stats. Value uses tabular
 * numerals for visual alignment when many cards sit side-by-side.
 */
export function StatCard({
  label,
  value,
  delta,
  deltaTone = "default",
  icon,
  className,
  loading,
}: StatCardProps) {
  return (
    <div
      className={cn(
        "group relative flex items-start justify-between gap-3 rounded-lg border bg-card p-4 shadow-sm transition-shadow hover:shadow-md",
        className,
      )}
    >
      <div className="min-w-0 flex-1">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          {label}
        </div>
        <div className="mt-1.5 truncate text-[26px] font-semibold leading-none tabular-nums text-foreground">
          {loading ? (
            <span className="inline-block h-6 w-16 animate-pulse rounded bg-muted" />
          ) : (
            value
          )}
        </div>
        {delta && !loading && (
          <div
            className={cn(
              "mt-2 text-xs font-medium",
              deltaTone === "positive" && "text-success",
              deltaTone === "negative" && "text-destructive",
              deltaTone === "default" && "text-muted-foreground",
            )}
          >
            {delta}
          </div>
        )}
      </div>
      {icon && (
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary transition-colors group-hover:bg-primary/15">
          {icon}
        </div>
      )}
    </div>
  );
}
