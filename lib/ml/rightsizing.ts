/**
 * Client-side confidence classifier for Azure Advisor's right-sizing
 * recommendations.
 *
 * Advisor is famously noisy — recommendations are based on short-window,
 * coarse heuristics. This module ingests the last N days of CPU metrics for
 * the VM and grades Advisor's suggestion:
 *
 *   HIGH   — Advisor is confident and metrics agree. Act on it.
 *   MEDIUM — Advisor is confident but metrics show occasional load. Verify.
 *   LOW    — Advisor's recommendation is likely wrong. Keep the VM.
 *   NONE   — No metric data available (deallocated, missing Reader role, etc.)
 *
 * Everything here is pure and side-effect free — it operates on data the
 * app has already fetched from Azure Monitor. No new writes.
 */

export type Confidence = "HIGH" | "MEDIUM" | "LOW" | "NONE";

export type RecommendationKind = "resize" | "shut-down" | "right-sized";

export interface MetricDataPoint {
  timeStamp: string;
  average?: number;
  maximum?: number;
}

export interface MetricStats {
  count: number;
  mean: number;
  p50: number;
  p95: number;
  max: number;
  /** Fraction of samples above 70% CPU — proxy for busy periods. */
  busyRatio: number;
}

export interface ConfidenceResult {
  confidence: Confidence;
  reason: string;
  stats: MetricStats | null;
}

/**
 * Compute descriptive statistics from a series of "Percentage CPU" datapoints.
 * Returns null for empty or fully-null series.
 */
export function statsFromCpuSeries(points: MetricDataPoint[]): MetricStats | null {
  const values = points
    .map((p) => (typeof p.average === "number" ? p.average : p.maximum))
    .filter((v): v is number => typeof v === "number" && Number.isFinite(v));

  if (values.length === 0) return null;

  const sorted = [...values].sort((a, b) => a - b);
  const percentile = (p: number): number => {
    if (sorted.length === 1) return sorted[0];
    const idx = (sorted.length - 1) * p;
    const lo = Math.floor(idx);
    const hi = Math.ceil(idx);
    if (lo === hi) return sorted[lo];
    const frac = idx - lo;
    return sorted[lo] * (1 - frac) + sorted[hi] * frac;
  };

  const mean = values.reduce((s, v) => s + v, 0) / values.length;
  const busy = values.filter((v) => v >= 70).length / values.length;

  return {
    count: values.length,
    mean,
    p50: percentile(0.5),
    p95: percentile(0.95),
    max: Math.max(...values),
    busyRatio: busy,
  };
}

/**
 * Grade a resize / shut-down recommendation given the VM's CPU statistics.
 *
 * "resize" (downsize) — we want confident downsize when both p95 and max
 * are low, meaning the VM is truly under-used. If p95 is fine but max spikes
 * are high, downsize might starve the VM at peak — medium confidence at best.
 *
 * "shut-down" — Advisor thinks the VM is idle. Any material CPU activity is
 * enough evidence to override it. We treat max CPU as the veto signal here
 * because even brief scheduled jobs count as "not idle."
 */
export function gradeRecommendation(
  kind: RecommendationKind,
  stats: MetricStats | null,
): ConfidenceResult {
  if (kind === "right-sized") {
    return {
      confidence: "HIGH",
      reason: "No Advisor recommendation — already sized appropriately.",
      stats,
    };
  }

  if (!stats || stats.count === 0) {
    return {
      confidence: "NONE",
      reason:
        "No CPU metrics available. VM may be deallocated, or Monitoring Reader may be missing.",
      stats: null,
    };
  }

  if (kind === "shut-down") {
    if (stats.max < 5 && stats.p95 < 2) {
      return {
        confidence: "HIGH",
        reason: `Truly idle — max CPU ${stats.max.toFixed(1)}%, p95 ${stats.p95.toFixed(1)}%.`,
        stats,
      };
    }
    if (stats.max < 20 && stats.p95 < 10) {
      return {
        confidence: "MEDIUM",
        reason: `Low but non-zero activity — max ${stats.max.toFixed(1)}%, p95 ${stats.p95.toFixed(1)}%. Verify no scheduled jobs.`,
        stats,
      };
    }
    return {
      confidence: "LOW",
      reason: `Not idle — max ${stats.max.toFixed(1)}%, p95 ${stats.p95.toFixed(1)}%. Advisor is likely wrong.`,
      stats,
    };
  }

  // kind === "resize" (downsize)
  if (stats.p95 < 15 && stats.max < 40 && stats.busyRatio === 0) {
    return {
      confidence: "HIGH",
      reason: `Consistently light load — p95 ${stats.p95.toFixed(1)}%, max ${stats.max.toFixed(1)}%.`,
      stats,
    };
  }
  if (stats.p95 < 30 && stats.max < 70 && stats.busyRatio < 0.02) {
    return {
      confidence: "MEDIUM",
      reason: `Mostly light with occasional spikes — max ${stats.max.toFixed(1)}%. Confirm no monthly batch load.`,
      stats,
    };
  }
  return {
    confidence: "LOW",
    reason: `Sustained load — p95 ${stats.p95.toFixed(1)}%, busy ratio ${(stats.busyRatio * 100).toFixed(0)}%. Downsize likely wrong.`,
    stats,
  };
}

/** Short label for the confidence badge. */
export function confidenceLabel(c: Confidence): string {
  switch (c) {
    case "HIGH":
      return "High confidence";
    case "MEDIUM":
      return "Medium confidence";
    case "LOW":
      return "Low confidence";
    case "NONE":
      return "No data";
  }
}

/**
 * Rank rows by "act on this first." Higher is more urgent to review.
 * Used to sort the right-sizing view so operators see the money first.
 */
export function actionPriority(kind: RecommendationKind, confidence: Confidence): number {
  if (kind === "right-sized") return 0;
  const kindWeight = kind === "shut-down" ? 3 : 2;
  const confWeight =
    confidence === "HIGH" ? 3 : confidence === "MEDIUM" ? 2 : confidence === "LOW" ? 1 : 0;
  return kindWeight * confWeight;
}
