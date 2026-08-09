"use client";

import { Activity } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { Anomaly } from "@/lib/ml/anomalies";

/**
 * Renders the current anomaly signal state. Handles three cases:
 *
 * 1. No baselines yet — a friendly info banner explaining that anomaly
 *    detection kicks in from the second session on.
 * 2. Baselines exist but nothing crossed a threshold — a success banner.
 * 3. Anomalies present — a card listing each deviation with severity.
 */
export function AnomaliesPanel({
  anomalies,
  sessionCount,
  isReady,
}: {
  anomalies: Anomaly[];
  sessionCount: number;
  isReady: boolean;
}) {
  if (!isReady) {
    return (
      <Alert>
        <Activity className="h-4 w-4" />
        <AlertTitle>Loading inventory…</AlertTitle>
        <AlertDescription>
          Meridian is pulling the current subscription rollup so it can
          compare against your stored baseline.
        </AlertDescription>
      </Alert>
    );
  }

  if (sessionCount < 2) {
    return (
      <Alert>
        <Activity className="h-4 w-4" />
        <AlertTitle>Building a baseline for your subscription</AlertTitle>
        <AlertDescription>
          Meridian captured today&apos;s rollup ({sessionCount} snapshot
          {sessionCount === 1 ? "" : "s"} so far). Anomaly detection turns
          on after your second session. All history lives in this browser
          only.
        </AlertDescription>
      </Alert>
    );
  }

  if (anomalies.length === 0) {
    return (
      <Alert variant="success">
        <Activity className="h-4 w-4" />
        <AlertTitle>Nothing unusual since your last sessions</AlertTitle>
        <AlertDescription>
          Current numbers are in line with the median of your last{" "}
          {Math.min(sessionCount, 7)} recorded sessions on this device.
        </AlertDescription>
      </Alert>
    );
  }

  const high = anomalies.filter((a) => a.severity === "HIGH").length;
  const medium = anomalies.filter((a) => a.severity === "MEDIUM").length;
  const low = anomalies.filter((a) => a.severity === "LOW").length;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm">
          <Activity className="h-4 w-4 text-primary" />
          What&apos;s changed since your last sessions
          <span className="ml-auto flex items-center gap-1.5 text-[10.5px] font-normal text-muted-foreground">
            {high > 0 && <Badge variant="destructive">{high} high</Badge>}
            {medium > 0 && <Badge variant="warning">{medium} medium</Badge>}
            {low > 0 && <Badge variant="outline">{low} low</Badge>}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 pb-4">
        {anomalies.map((a) => (
          <AnomalyRow key={a.key} anomaly={a} />
        ))}
        <p className="mt-3 border-t pt-2 text-[11px] leading-relaxed text-muted-foreground">
          Baseline is the median of your last {Math.min(sessionCount, 7)}{" "}
          rollups on this device. History lives in this browser only —
          clearing site data resets the baseline.
        </p>
      </CardContent>
    </Card>
  );
}

function AnomalyRow({ anomaly }: { anomaly: Anomaly }) {
  const direction = anomaly.delta > 0 ? "↑" : "↓";
  const badgeVariant: "destructive" | "warning" | "outline" =
    anomaly.severity === "HIGH"
      ? "destructive"
      : anomaly.severity === "MEDIUM"
        ? "warning"
        : "outline";
  return (
    <div className="flex items-start gap-3 rounded-md border bg-card/60 px-3 py-2.5 text-sm">
      <Badge variant={badgeVariant} className="mt-0.5 shrink-0">
        {anomaly.severity}
      </Badge>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className="font-medium">{anomaly.label}</span>
          <span className="font-mono text-[11px] text-muted-foreground tabular-nums">
            {direction} {Math.abs(anomaly.delta).toFixed(0)} (
            {anomaly.baseline.toFixed(0)} → {anomaly.current})
          </span>
        </div>
        <p className="mt-0.5 text-xs text-muted-foreground">{anomaly.reason}</p>
      </div>
    </div>
  );
}
