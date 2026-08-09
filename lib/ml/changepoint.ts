/**
 * Changepoint detection on a metric series.
 *
 * Finds the point(s) in time where a series' statistical regime shifted —
 * distinguishing a permanent step change (e.g. a workload's CPU baseline
 * jumped after a deployment) from a transient spike.
 *
 * Implements:
 *   - CUSUM (cumulative sum control chart) for fast single-shift detection.
 *   - PELT-style exact segmentation with an L2 (change-in-mean) cost and a
 *     BIC-flavoured penalty, capped in complexity for browser use.
 *
 * Pure math over already-fetched Azure Monitor samples. No writes.
 */

export interface ChangePoint {
  /** Index in the series where the new segment begins. */
  index: number;
  /** ISO timestamp if timestamps were provided. */
  time?: string;
  /** Mean before the change. */
  before: number;
  /** Mean after the change. */
  after: number;
  /** Signed shift (after - before). */
  delta: number;
  /** Direction of the shift. */
  direction: "up" | "down";
}

function mean(xs: number[], lo: number, hi: number): number {
  let s = 0;
  for (let i = lo; i < hi; i++) s += xs[i];
  return hi > lo ? s / (hi - lo) : 0;
}

/**
 * CUSUM detector. Returns the single most likely changepoint, or null when
 * the cumulative deviation never breaches the threshold. `k` is the slack
 * (half the shift you care about) in units of the series' own std.
 */
export function cusum(values: number[], opts: { threshold?: number; k?: number } = {}): ChangePoint | null {
  const v = values.filter((x) => Number.isFinite(x));
  if (v.length < 8) return null;

  const mu = mean(v, 0, v.length);
  const std = Math.sqrt(mean(v.map((x) => (x - mu) ** 2), 0, v.length)) || 1;
  const k = (opts.k ?? 0.5) * std;
  const threshold = (opts.threshold ?? 5) * std;

  let sHi = 0;
  let sLo = 0;
  let peakIdx = -1;
  let peakVal = 0;
  for (let i = 0; i < v.length; i++) {
    sHi = Math.max(0, sHi + (v[i] - mu) - k);
    sLo = Math.max(0, sLo - (v[i] - mu) - k);
    const mag = Math.max(sHi, sLo);
    if (mag > peakVal) {
      peakVal = mag;
      peakIdx = i;
    }
  }

  if (peakVal < threshold || peakIdx <= 0 || peakIdx >= v.length - 1) return null;
  const before = mean(v, 0, peakIdx);
  const after = mean(v, peakIdx, v.length);
  return {
    index: peakIdx,
    before,
    after,
    delta: after - before,
    direction: after >= before ? "up" : "down",
  };
}

/**
 * PELT-style exact change-in-mean segmentation. Returns all changepoints
 * that reduce total L2 cost by more than the penalty. O(n²) worst case,
 * fine for the hundreds-of-samples series we handle.
 */
export function pelt(
  values: number[],
  timestamps?: string[],
  opts: { penalty?: number; minSize?: number } = {},
): ChangePoint[] {
  const v = values.filter((x) => Number.isFinite(x));
  const n = v.length;
  if (n < 12) return [];

  const minSize = opts.minSize ?? 4;
  const globalVar =
    mean(v.map((x) => (x - mean(v, 0, n)) ** 2), 0, n) || 1;
  // BIC-flavoured penalty scaled by variance and log n.
  const penalty = (opts.penalty ?? 2) * globalVar * Math.log(n);

  // Prefix sums for O(1) segment cost (L2 = sum of squares - n*mean²).
  const pre = new Array(n + 1).fill(0);
  const pre2 = new Array(n + 1).fill(0);
  for (let i = 0; i < n; i++) {
    pre[i + 1] = pre[i] + v[i];
    pre2[i + 1] = pre2[i] + v[i] * v[i];
  }
  const segCost = (lo: number, hi: number): number => {
    const len = hi - lo;
    if (len <= 0) return 0;
    const sum = pre[hi] - pre[lo];
    const sumSq = pre2[hi] - pre2[lo];
    return sumSq - (sum * sum) / len;
  };

  // DP: F[i] = min cost of segmenting v[0..i). lastCp[i] = previous cp.
  const F = new Array(n + 1).fill(Infinity);
  const lastCp = new Array(n + 1).fill(0);
  F[0] = -penalty;
  for (let t = minSize; t <= n; t++) {
    for (let s = 0; s <= t - minSize; s++) {
      if (!Number.isFinite(F[s])) continue;
      const cost = F[s] + segCost(s, t) + penalty;
      if (cost < F[t]) {
        F[t] = cost;
        lastCp[t] = s;
      }
    }
  }

  // Backtrack changepoints.
  const cps: number[] = [];
  let t = n;
  let guard = 0;
  while (t > 0 && guard++ < n + 5) {
    const s = lastCp[t];
    if (s > 0) cps.unshift(s);
    t = s;
  }

  return cps.map((idx) => {
    const before = mean(v, Math.max(0, prevCp(cps, idx)), idx);
    const after = mean(v, idx, nextCp(cps, idx, n));
    return {
      index: idx,
      time: timestamps?.[idx],
      before,
      after,
      delta: after - before,
      direction: after >= before ? "up" : "down",
    } as ChangePoint;
  });
}

function prevCp(cps: number[], idx: number): number {
  let prev = 0;
  for (const c of cps) {
    if (c < idx) prev = c;
    else break;
  }
  return prev;
}

function nextCp(cps: number[], idx: number, n: number): number {
  for (const c of cps) if (c > idx) return c;
  return n;
}
