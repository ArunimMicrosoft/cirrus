"use client";

import { CloudOff, ArrowRight } from "lucide-react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";

/**
 * Shown in File/Offline mode for views that need a live Azure connection —
 * cost (billing) and metrics (telemetry) data simply isn't present in an
 * infrastructure file, so we say so plainly instead of showing empty charts.
 */
export function OfflineUnsupported() {
  return (
    <Card className="mx-auto max-w-xl">
      <CardContent className="flex flex-col items-center gap-4 py-12 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
          <CloudOff className="h-6 w-6" />
        </div>
        <div className="space-y-1.5">
          <h2 className="text-lg font-semibold">Needs a live Azure connection</h2>
          <p className="mx-auto max-w-md text-sm text-muted-foreground">
            This view relies on billing and telemetry data (spend, metrics,
            utilization) that isn&apos;t part of an ARM template or Terraform
            state file. It only works when you connect a tenant with Reader
            access.
          </p>
        </div>
        <p className="text-xs text-muted-foreground">
          Everything network- and configuration-based — topology, reachability,
          NSG/WAF, IPAM, inventory — works from your file.
        </p>
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
        >
          Connect a tenant instead
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </CardContent>
    </Card>
  );
}
