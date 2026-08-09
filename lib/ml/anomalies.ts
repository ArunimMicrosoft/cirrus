/**
 * Client-side anomaly detector for subscription-level metrics.
 *
 * Every time the dashboard loads, we quietly capture a rollup of the
 * inventory + risk counts (see BaselineMetrics in lib/idb.ts) into
 * IndexedDB — one row per calendar day. On subsequent loads we compare
 * today's numbers against the median of the last N stored baselines and
 * flag anything materially out of line.
 *
 * Nothing here leaves the browser. Everything the operator sees is a
 * function of their own past sessions on this device.
 */

import type { BaselineMetrics, StoredBaseline } from "@/lib/idb";

export type AnomalySeverity = "HIGH" | "MEDIUM" | "LOW";

export interface Anomaly {
  /** Metric key inside BaselineMetrics. */
  key: keyof BaselineMetrics;
  /** Human-readable label for the metric. */
  label: string;
  current: number;
  baseline: number;
  delta: number;
  deltaPct: number;
  severity: AnomalySeverity;
  reason: string;
}

interface MetricSpec {
  key: keyof BaselineMetrics;
  label: string;
  /** Absolute change that triggers a flag regardless of percent delta. */
  absoluteThreshold: number;
  /** Percent change that triggers a flag once baseline is non-trivial. */
  percentThreshold: number;
  /** Which direction to worry about — "up" for security counts, "either" for others. */
  direction: "up" | "either";
  /** Bump severity when absolute change exceeds this. */
  highWhenAbs?: number;
}

const SPECS: MetricSpec[] = [
  {
    key: "riskyNsgRules",
    label: "NSG rules open to Internet",
    absoluteThreshold: 1,
    percentThreshold: 25,
    direction: "up",
    highWhenAbs: 1,
  },
  {
    key: "publicStorage",
    label: "Storage accounts with public access",
    absoluteThreshold: 1,
    percentThreshold: 25,
    direction: "up",
    highWhenAbs: 1,
  },
  {
    key: "appServicesNoHttps",
    label: "App Services without HTTPS-only",
    absoluteThreshold: 1,
    percentThreshold: 25,
    direction: "up",
    highWhenAbs: 1,
  },
  {
    key: "orphanDisks",
    label: "Unattached disks",
    absoluteThreshold: 5,
    percentThreshold: 30,
    direction: "up",
    highWhenAbs: 20,
  },
  {
    key: "orphanPips",
    label: "Unused public IPs",
    absoluteThreshold: 3,
    percentThreshold: 30,
    direction: "up",
    highWhenAbs: 10,
  },
  {
    key: "publicIpCount",
    label: "Public IP total",
    absoluteThreshold: 5,
    percentThreshold: 20,
    direction: "either",
    highWhenAbs: 20,
  },
  {
    key: "vmCount",
    label: "Virtual Machines",
    absoluteThreshold: 5,
    percentThreshold: 20,
    direction: "either",
  },
  {
    key: "storageCount",
    label: "Storage Accounts",
    absoluteThreshold: 3,
    percentThreshold: 25,
    direction: "either",
  },
  {
    key: "sqlServerCount",
    label: "SQL Servers",
    absoluteThreshold: 1,
    percentThreshold: 33,
    direction: "either",
  },
  {
    key: "resourceGroupCount",
    label: "Resource Groups",
    absoluteThreshold: 5,
    percentThreshold: 25,
    direction: "either",
  },
];

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

/**
 * Compare `current` (freshly captured) against `history` (all prior
 * baselines) and return the anomalies worth surfacing. History should be
 * newest-first; we use the last 7 entries as the comparison window.
 */
export function detectAnomalies(
  current: BaselineMetrics,
  history: StoredBaseline[],
): Anomaly[] {
  if (history.length < 2) return [];
  const window = history.slice(0, 7);
  const anomalies: Anomaly[] = [];

  for (const spec of SPECS) {
    const currentValue = current[spec.key];
    const baselineValues = window.map((h) => h.metrics[spec.key]);
    const baseline = median(baselineValues);
    const delta = currentValue - baseline;
    const absDelta = Math.abs(delta);
    const deltaPct = baseline === 0 ? (currentValue === 0 ? 0 : 100) : (delta / baseline) * 100;

    if (spec.direction === "up" && delta <= 0) continue;

    const triggersAbsolute = absDelta >= spec.absoluteThreshold;
    const triggersPercent =
      baseline >= 3 && Math.abs(deltaPct) >= spec.percentThreshold;

    if (!triggersAbsolute && !triggersPercent) continue;

    // Severity.
    let severity: AnomalySeverity = "LOW";
    if (spec.direction === "up") {
      severity = "MEDIUM";
      if (spec.highWhenAbs && absDelta >= spec.highWhenAbs) severity = "HIGH";
      // Any positive movement on strictly-up metrics with critical semantics
      // (open ports, public storage) is HIGH.
      if (
        spec.key === "riskyNsgRules" ||
        spec.key === "publicStorage" ||
        spec.key === "appServicesNoHttps"
      ) {
        severity = "HIGH";
      }
    } else {
      severity =
        (spec.highWhenAbs && absDelta >= spec.highWhenAbs) || Math.abs(deltaPct) >= 40
          ? "MEDIUM"
          : "LOW";
    }

    const direction = delta > 0 ? "up" : "down";
    const reason = spec.direction === "up"
      ? `Up by ${absDelta.toFixed(0)} (from ${baseline.toFixed(0)} baseline).`
      : `${direction === "up" ? "Up" : "Down"} ${absDelta.toFixed(0)} (${deltaPct >= 0 ? "+" : ""}${deltaPct.toFixed(0)}% vs ${baseline.toFixed(0)} baseline).`;

    anomalies.push({
      key: spec.key,
      label: spec.label,
      current: currentValue,
      baseline,
      delta,
      deltaPct,
      severity,
      reason,
    });
  }

  // Sort highest severity first, then largest absolute change.
  anomalies.sort((a, b) => {
    const sw = severityWeight(b.severity) - severityWeight(a.severity);
    if (sw !== 0) return sw;
    return Math.abs(b.delta) - Math.abs(a.delta);
  });
  return anomalies;
}

function severityWeight(s: AnomalySeverity): number {
  if (s === "HIGH") return 3;
  if (s === "MEDIUM") return 2;
  return 1;
}
