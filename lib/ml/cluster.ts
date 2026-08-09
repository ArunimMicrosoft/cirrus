/**
 * Unsupervised workload clustering.
 *
 * Pure math. Groups VMs by the *shape* of their behaviour (not their SKU)
 * so an operator can see workload archetypes — steady batch, spiky web,
 * idle zombie, cyclical business-hours — emerge from the data.
 *
 * Implements:
 *   - k-means (Lloyd's algorithm) with k-means++ seeding and multiple
 *     restarts, on z-score-standardised feature vectors.
 *   - Silhouette score to judge cluster quality and auto-pick k.
 *   - A feature extractor that turns a CPU (and optional memory) series
 *     into an interpretable behaviour vector.
 *   - A heuristic archetype labeller over the resulting centroids.
 */

export interface WorkloadFeatures {
  /** Mean utilisation 0..100. */
  mean: number;
  /** Standard deviation of utilisation. */
  std: number;
  /** 95th percentile utilisation. */
  p95: number;
  /** Peak-to-mean ratio (burstiness). */
  burstiness: number;
  /** Fraction of samples below 5% (idleness). */
  idleFraction: number;
  /** Diurnal amplitude: normalised range of the hourly-average curve. */
  diurnalAmplitude: number;
}

export const FEATURE_KEYS: Array<keyof WorkloadFeatures> = [
  "mean",
  "std",
  "p95",
  "burstiness",
  "idleFraction",
  "diurnalAmplitude",
];

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  if (sorted.length === 1) return sorted[0];
  const idx = (sorted.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  return lo === hi ? sorted[lo] : sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

/**
 * Extract a behaviour vector from a utilisation series. `timestamps` (ISO)
 * are optional; when present the diurnal amplitude is computed from the
 * hour-of-day average curve, otherwise it is 0.
 */
export function extractFeatures(
  values: number[],
  timestamps?: string[],
): WorkloadFeatures | null {
  const v = values.filter((x) => Number.isFinite(x));
  if (v.length < 3) return null;

  const m = v.reduce((s, x) => s + x, 0) / v.length;
  const std = Math.sqrt(
    v.reduce((s, x) => s + (x - m) ** 2, 0) / v.length,
  );
  const sorted = [...v].sort((a, b) => a - b);
  const p95 = percentile(sorted, 0.95);
  const peak = sorted[sorted.length - 1];
  const burstiness = m > 0.5 ? peak / m : peak > 5 ? 4 : 1;
  const idleFraction = v.filter((x) => x < 5).length / v.length;

  let diurnalAmplitude = 0;
  if (timestamps && timestamps.length === values.length) {
    const buckets = new Array(24).fill(0);
    const counts = new Array(24).fill(0);
    values.forEach((val, i) => {
      if (!Number.isFinite(val)) return;
      const h = new Date(timestamps[i]).getHours();
      if (Number.isNaN(h)) return;
      buckets[h] += val;
      counts[h] += 1;
    });
    const hourly = buckets
      .map((b, i) => (counts[i] > 0 ? b / counts[i] : null))
      .filter((x): x is number => x !== null);
    if (hourly.length >= 4) {
      const hi = Math.max(...hourly);
      const lo = Math.min(...hourly);
      diurnalAmplitude = hi > 0 ? (hi - lo) / hi : 0;
    }
  }

  return { mean: m, std, p95, burstiness, idleFraction, diurnalAmplitude };
}

/** Standardise columns to z-scores so no single feature dominates distance. */
function standardise(rows: number[][]): { z: number[][]; mean: number[]; std: number[] } {
  const cols = rows[0]?.length ?? 0;
  const mu = new Array(cols).fill(0);
  const sd = new Array(cols).fill(0);
  for (let c = 0; c < cols; c++) {
    const col = rows.map((r) => r[c]);
    mu[c] = col.reduce((s, x) => s + x, 0) / col.length;
    sd[c] = Math.sqrt(col.reduce((s, x) => s + (x - mu[c]) ** 2, 0) / col.length) || 1;
  }
  const z = rows.map((r) => r.map((v, c) => (v - mu[c]) / sd[c]));
  return { z, mean: mu, std: sd };
}

function dist2(a: number[], b: number[]): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += (a[i] - b[i]) ** 2;
  return s;
}

/** k-means++ seeding: spread initial centroids by squared-distance weighting. */
function seedPlusPlus(data: number[][], k: number, rand: () => number): number[][] {
  const centroids: number[][] = [];
  centroids.push([...data[Math.floor(rand() * data.length)]]);
  while (centroids.length < k) {
    const d2 = data.map((p) => Math.min(...centroids.map((c) => dist2(p, c))));
    const total = d2.reduce((s, x) => s + x, 0) || 1;
    let r = rand() * total;
    let idx = 0;
    for (let i = 0; i < d2.length; i++) {
      r -= d2[i];
      if (r <= 0) {
        idx = i;
        break;
      }
    }
    centroids.push([...data[idx]]);
  }
  return centroids;
}

/** Deterministic PRNG (mulberry32) so results are reproducible per session. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface KMeansResult {
  /** Cluster index per input row. */
  assignments: number[];
  /** Centroids in standardised space. */
  centroids: number[][];
  /** Centroids back in original feature units. */
  centroidsRaw: number[][];
  /** Mean silhouette over all points, -1..1 (higher is better separation). */
  silhouette: number;
  k: number;
}

function lloyd(z: number[][], k: number, rand: () => number, iters = 50): {
  assignments: number[];
  centroids: number[][];
  inertia: number;
} {
  let centroids = seedPlusPlus(z, k, rand);
  const assignments = new Array(z.length).fill(0);
  for (let it = 0; it < iters; it++) {
    let moved = false;
    for (let i = 0; i < z.length; i++) {
      let bestK = 0;
      let bestD = Infinity;
      for (let c = 0; c < k; c++) {
        const d = dist2(z[i], centroids[c]);
        if (d < bestD) {
          bestD = d;
          bestK = c;
        }
      }
      if (assignments[i] !== bestK) {
        assignments[i] = bestK;
        moved = true;
      }
    }
    const sums = Array.from({ length: k }, () => new Array(z[0].length).fill(0));
    const counts = new Array(k).fill(0);
    for (let i = 0; i < z.length; i++) {
      counts[assignments[i]]++;
      for (let d = 0; d < z[0].length; d++) sums[assignments[i]][d] += z[i][d];
    }
    for (let c = 0; c < k; c++) {
      if (counts[c] > 0) centroids[c] = sums[c].map((s) => s / counts[c]);
    }
    if (!moved && it > 0) break;
  }
  const inertia = z.reduce((s, p, i) => s + dist2(p, centroids[assignments[i]]), 0);
  return { assignments, centroids, inertia };
}

function silhouette(z: number[][], assignments: number[], k: number): number {
  if (k < 2 || z.length <= k) return 0;
  const byCluster: number[][] = Array.from({ length: k }, () => []);
  assignments.forEach((c, i) => byCluster[c].push(i));

  let total = 0;
  let count = 0;
  for (let i = 0; i < z.length; i++) {
    const own = byCluster[assignments[i]];
    if (own.length <= 1) continue;
    const a =
      own.filter((j) => j !== i).reduce((s, j) => s + Math.sqrt(dist2(z[i], z[j])), 0) /
      (own.length - 1);
    let b = Infinity;
    for (let c = 0; c < k; c++) {
      if (c === assignments[i] || byCluster[c].length === 0) continue;
      const avg =
        byCluster[c].reduce((s, j) => s + Math.sqrt(dist2(z[i], z[j])), 0) /
        byCluster[c].length;
      b = Math.min(b, avg);
    }
    total += (b - a) / Math.max(a, b);
    count++;
  }
  return count > 0 ? total / count : 0;
}

/**
 * Cluster feature rows. Auto-selects k in [2..maxK] by best silhouette,
 * with several random restarts per k for stability. Fewer than 4 rows
 * returns a single trivial cluster.
 */
export function clusterWorkloads(
  rows: number[][],
  opts: { maxK?: number; restarts?: number; seed?: number } = {},
): KMeansResult {
  const n = rows.length;
  if (n < 4) {
    return {
      assignments: new Array(n).fill(0),
      centroids: [],
      centroidsRaw: rows.length ? [meanRow(rows)] : [],
      silhouette: 0,
      k: 1,
    };
  }

  const { z, mean: mu, std: sd } = standardise(rows);
  const maxK = Math.min(opts.maxK ?? 5, n - 1);
  const restarts = opts.restarts ?? 6;
  const rand = mulberry32(opts.seed ?? 42);

  let best: KMeansResult | null = null;
  for (let k = 2; k <= maxK; k++) {
    let bestForK: { assignments: number[]; centroids: number[][]; inertia: number } | null = null;
    for (let r = 0; r < restarts; r++) {
      const res = lloyd(z, k, rand);
      if (!bestForK || res.inertia < bestForK.inertia) bestForK = res;
    }
    if (!bestForK) continue;
    const sil = silhouette(z, bestForK.assignments, k);
    if (!best || sil > best.silhouette) {
      best = {
        assignments: bestForK.assignments,
        centroids: bestForK.centroids,
        centroidsRaw: bestForK.centroids.map((c) => c.map((v, i) => v * sd[i] + mu[i])),
        silhouette: sil,
        k,
      };
    }
  }

  return (
    best ?? {
      assignments: new Array(n).fill(0),
      centroids: [],
      centroidsRaw: [meanRow(rows)],
      silhouette: 0,
      k: 1,
    }
  );
}

function meanRow(rows: number[][]): number[] {
  const cols = rows[0]?.length ?? 0;
  const out = new Array(cols).fill(0);
  for (const r of rows) for (let c = 0; c < cols; c++) out[c] += r[c];
  return out.map((s) => s / rows.length);
}

/**
 * Heuristic archetype label from a centroid's raw feature values. Uses the
 * same interpretable thresholds an operator would reason with.
 */
export function labelArchetype(f: WorkloadFeatures): {
  label: string;
  hint: string;
} {
  if (f.idleFraction > 0.8 && f.p95 < 15) {
    return { label: "Idle / zombie", hint: "Candidate for shutdown or removal" };
  }
  if (f.diurnalAmplitude > 0.5 && f.mean < 50) {
    return { label: "Business-hours cyclical", hint: "Consider auto-shutdown off-hours or a schedule" };
  }
  if (f.burstiness > 3 && f.mean < 40) {
    return { label: "Spiky / bursty", hint: "Good fit for burstable B-series SKUs" };
  }
  if (f.std < 10 && f.mean > 55) {
    return { label: "Steady high-load", hint: "Reserved Instance / Savings Plan candidate" };
  }
  if (f.std < 10 && f.mean <= 55) {
    return { label: "Steady moderate", hint: "Predictable — right-size to p95 with headroom" };
  }
  return { label: "Variable", hint: "Mixed behaviour — review individually" };
}
