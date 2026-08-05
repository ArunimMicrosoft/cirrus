"use client";

import { cn } from "@/lib/utils";

interface PageHeaderProps {
  title: string;
  description?: string;
  actions?: React.ReactNode;
  icon?: React.ReactNode;
  className?: string;
}

export function PageHeader({
  title,
  description,
  actions,
  icon,
  className,
}: PageHeaderProps) {
  return (
    <div
      className={cn(
        "flex flex-col gap-3 pb-2 md:flex-row md:items-end md:justify-between",
        className,
      )}
    >
      <div className="flex items-start gap-3">
        {icon && (
          <div className="mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-md border bg-card text-primary">
            {icon}
          </div>
        )}
        <div>
          <h1 className="font-display text-[26px] leading-tight tracking-tight md:text-[30px]">
            {title}
          </h1>
          {description && (
            <p className="mt-1 max-w-2xl text-[13px] leading-relaxed text-muted-foreground">
              {description}
            </p>
          )}
        </div>
      </div>
      {actions && (
        <div className="flex items-center gap-2 md:shrink-0">{actions}</div>
      )}
    </div>
  );
}
