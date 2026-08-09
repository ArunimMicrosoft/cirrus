/**
 * Distribution-based right-sizing.
 *
 * Instead of a confidence label on Advisor's suggestion, this models the
 * VM's actual utilisation distribution and sizes to a statistical target
 * (p99 + headroom), then quantifies the risk of throttling if the VM were
 * downsized to the next step down. Pure math over already-fetched metrics.
 *
 * This mirrors the methodology of AWS Compute Optimizer / GCP Recommender:
 * size to a high percentile with explicit headroom, and express confidence
 * as the probability the workload stays under the smaller SKU's ceiling.
 */

export interface UtilStats {
  n: number;
  mean: number;
  p50: number;
  p90: number;
  p95: number;
  p99: number;
  max: number;
  std: number;
}

export type SizingAction = "downsize" | "keep" | "upsize" | "insufficient-data";

export interface SizingVerdict {
  action: SizingAction;
  /** Target utilisation the current SKU runs at (p99). */
  p99: number;
  /** Recommended headroom-adjusted target load, 0..100. */
  targetLoad: number;
  /**
   * If downsizing by one step (halving vCPU heuristic), the projected p99
   * on the smaller SKU and the probability it exceeds a safe ceiling.
   */
  projectedP99IfHalved: number;
  /** Probability (0..1) the smaller SKU would breach the ceiling. */
  throttleRisk: number;
  /** 0..1 confidence in the recommendation given sample size + variance. */
  confidence: number;
  reason: string;
  stats: UtilStats;
}

const CEILING = 80; // don't let a resized VM routinely exceed this %
const HEADROOM = 1.3; // 30% headroom over observed p99

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  if (sorted.length === 1) return sorted[0];
  const idx = (sorted.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  return lo === hi ? sorted[lo] : sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

export function utilStats(values: number[]): UtilStats | null {
  const v = values.filter((x) => Number.isFinite(x));
  if (v.length === 0) return null;
  const sorted = [...v].sort((a, b) => a - b);
  const mean = v.reduce((s, x) => s + x, 0) / v.length;
  const std = Math.sqrt(v.reduce((s, x) => s + (x - mean) ** 2, 0) / v.length);
  return {
    n: v.length,
    mean,
    p50: percentile(sorted, 0.5),
    p90: percentile(sorted, 0.9),
    p95: percentile(sorted, 0.95),
    p99: percentile(sorted, 0.99),
    max: sorted[sorted.length - 1],
    std,
  };
}

/**
 * Normal-tail probability that utilisation exceeds `ceiling`, given the
 * fitted mean/std. Uses a logistic approximation to the Gaussian CDF so we
 * don't need erf. Good to ~1% absolute error, plenty for a risk read-out.
 */
function exceedProbability(mean: number, std: number, ceiling: number): number {
  if (std <= 1e-6) return mean >= ceiling ? 1 : 0;
  const zRaw = (ceiling - mean) / std;
  // P(X > ceiling) = 1 - Phi(z); logistic approx of Phi.
  const phi = 1 / (1 + Math.exp(-1.702 * zRaw));
  return Math.min(1, Math.max(0, 1 - phi));
}

/**
 * Produce a rigorous downsize/keep/upsize verdict from a utilisation series.
 * The "halved" projection models the common one-step-down move (≈2x load on
 * half the vCPUs); adjust `downsizeFactor` for finer SKU ladders.
 */
export function sizingVerdict(
  values: number[],
  opts: { downsizeFactor?: number } = {},
): SizingVerdict {
  const stats = utilStats(values);
  if (!stats || stats.n < 24) {
    return {
      action: "insufficient-data",
      p99: stats?.p99 ?? 0,
      targetLoad: 0,
      projectedP99IfHalved: 0,
      throttleRisk: 0,
      confidence: 0,
      reason:
        stats == null
          ? "No metric samples available."
          : `Only ${stats.n} samples — need ≥24 for a reliable distribution.`,
      stats: stats ?? {
        n: 0,
        mean: 0,
        p50: 0,
        p90: 0,
        p95: 0,
        p99: 0,
        max: 0,
        std: 0,
      },
    };
  }

  const factor = opts.downsizeFactor ?? 2; // one step down ≈ double the load
  const targetLoad = stats.p99 * HEADROOM;
  const projectedMeanHalved = stats.mean * factor;
  const projectedStdHalved = stats.std * factor;
  const projectedP99IfHalved = Math.min(100, stats.p99 * factor);
  const throttleRisk = exceedProbability(projectedMeanHalved, projectedStdHalved, CEILING);

  // Confidence grows with sample size and shrinks with relative variance.
  const cv = stats.mean > 1 ? stats.std / stats.mean : 1;
  const sampleConf = Math.min(1, stats.n / 240); // ~10 days at hourly cadence
  const stabilityConf = Math.max(0, 1 - Math.min(1, cv));
  const confidence = Math.round(100 * (0.6 * sampleConf + 0.4 * stabilityConf)) / 100;

  let action: SizingAction;
  let reason: string;
  if (stats.p95 >= 75) {
    action = "upsize";
    reason = `Sustained high load (p95 ${stats.p95.toFixed(0)}%). Headroom is thin — consider a larger SKU.`;
  } else if (targetLoad < CEILING && throttleRisk < 0.1) {
    action = "downsize";
    reason = `p99 is ${stats.p99.toFixed(0)}%; even one step down keeps projected p99 at ${projectedP99IfHalved.toFixed(0)}% with ${(throttleRisk * 100).toFixed(0)}% throttle risk.`;
  } else if (throttleRisk < 0.3) {
    action = "keep";
    reason = `Downsizing would raise throttle risk to ${(throttleRisk * 100).toFixed(0)}%. Borderline — hold unless cost pressure is high.`;
  } else {
    action = "keep";
    reason = `Downsizing risks throttling (${(throttleRisk * 100).toFixed(0)}% chance of exceeding ${CEILING}%). Keep current size.`;
  }

  return {
    action,
    p99: stats.p99,
    targetLoad,
    projectedP99IfHalved,
    throttleRisk,
    confidence,
    reason,
    stats,
  };
}
