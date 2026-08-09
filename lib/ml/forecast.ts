/**
 * Time-series forecasting and trend projection.
 *
 * Pure math. No Azure calls, no network, no state. Operates on numeric
 * series the app has already fetched or accumulated (e.g. the daily
 * subscription baselines stored in IndexedDB).
 *
 * Implements:
 *   - Holt-Winters triple exponential smoothing (additive) with a grid
 *     search over (alpha, beta, gamma) minimising in-sample SSE, plus an
 *     out-of-sample prediction interval derived from residual variance.
 *   - Theil-Sen robust linear regression (median of pairwise slopes) —
 *     resistant to the outliers that wreck ordinary least squares on
 *     spiky cloud-usage series.
 *   - Quota / capacity exhaustion projection: extrapolate a robust trend
 *     to a hard limit and return the ETA with a confidence read-out.
 */

export interface ForecastPoint {
  /** Steps ahead from the last observation (1-based). */
  step: number;
  /** Point forecast. */
  value: number;
  /** Lower bound of the ~95% prediction interval. */
  lower: number;
  /** Upper bound of the ~95% prediction interval. */
  upper: number;
}

export interface HoltWintersResult {
  forecasts: ForecastPoint[];
  /** Fitted smoothing parameters. */
  alpha: number;
  beta: number;
  gamma: number;
  /** Root mean squared in-sample error. */
  rmse: number;
  /** Detected season length used (1 = no seasonality). */
  seasonLength: number;
  /** Share of the final movement attributable to trend vs season, 0..1. */
  trendShare: number;
}

/** Simple arithmetic helpers kept local so this file has no imports. */
function mean(xs: number[]): number {
  if (xs.length === 0) return 0;
  return xs.reduce((s, x) => s + x, 0) / xs.length;
}

function variance(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return xs.reduce((s, x) => s + (x - m) ** 2, 0) / (xs.length - 1);
}

/**
 * Additive Holt-Winters for a single (alpha, beta, gamma) triple.
 * Returns fitted level/trend/season plus one-step residuals.
 */
function holtWintersFit(
  y: number[],
  m: number,
  alpha: number,
  beta: number,
  gamma: number,
): { residuals: number[]; level: number; trend: number; season: number[] } {
  // Seasonal init: average of first season, seasonal indices as deviations.
  let level: number;
  let trend: number;
  const season: number[] = new Array(m).fill(0);

  if (m > 1 && y.length >= 2 * m) {
    const firstSeason = y.slice(0, m);
    const secondSeason = y.slice(m, 2 * m);
    level = mean(firstSeason);
    trend = (mean(secondSeason) - mean(firstSeason)) / m;
    for (let i = 0; i < m; i++) season[i] = y[i] - level;
  } else {
    level = y[0];
    trend = y.length > 1 ? y[1] - y[0] : 0;
  }

  const residuals: number[] = [];
  for (let t = 0; t < y.length; t++) {
    const s = m > 1 ? season[t % m] : 0;
    const forecast = level + trend + s;
    residuals.push(y[t] - forecast);

    const prevLevel = level;
    level = alpha * (y[t] - s) + (1 - alpha) * (level + trend);
    trend = beta * (level - prevLevel) + (1 - beta) * trend;
    if (m > 1) {
      season[t % m] = gamma * (y[t] - level) + (1 - gamma) * s;
    }
  }
  return { residuals, level, trend, season };
}

/**
 * Detect a dominant season length by autocorrelation. Returns 1 when no
 * meaningful seasonality is found (short series or flat autocorrelation).
 * Candidate lags are 7 (weekly) and 30 (monthly-ish) which cover the
 * cadences that matter for daily cloud rollups.
 */
export function detectSeasonLength(y: number[]): number {
  if (y.length < 14) return 1;
  const candidates = [7, 30].filter((c) => y.length >= 2 * c);
  let best = 1;
  let bestAcf = 0.3; // require a minimum correlation to accept seasonality
  const m = mean(y);
  const denom = y.reduce((s, v) => s + (v - m) ** 2, 0) || 1;
  for (const lag of candidates) {
    let num = 0;
    for (let t = lag; t < y.length; t++) num += (y[t] - m) * (y[t - lag] - m);
    const acf = num / denom;
    if (acf > bestAcf) {
      bestAcf = acf;
      best = lag;
    }
  }
  return best;
}

/**
 * Forecast `horizon` steps with additive Holt-Winters. Grid-searches the
 * smoothing parameters to minimise in-sample SSE, then widens a prediction
 * interval by sqrt(step) * residual sigma (a standard random-walk-of-errors
 * approximation good enough for operational forecasting).
 */
export function holtWintersForecast(
  y: number[],
  horizon: number,
  opts: { seasonLength?: number } = {},
): HoltWintersResult | null {
  const clean = y.filter((v) => Number.isFinite(v));
  if (clean.length < 4) return null;

  const m = opts.seasonLength ?? detectSeasonLength(clean);
  const grid = [0.1, 0.3, 0.5, 0.7, 0.9];
  const betaGrid = [0.0, 0.1, 0.3, 0.5];
  const gammaGrid = m > 1 ? [0.1, 0.3, 0.5] : [0];

  let best: {
    sse: number;
    alpha: number;
    beta: number;
    gamma: number;
    fit: ReturnType<typeof holtWintersFit>;
  } | null = null;

  for (const alpha of grid) {
    for (const beta of betaGrid) {
      for (const gamma of gammaGrid) {
        const fit = holtWintersFit(clean, m, alpha, beta, gamma);
        const sse = fit.residuals.reduce((s, r) => s + r * r, 0);
        if (!best || sse < best.sse) best = { sse, alpha, beta, gamma, fit };
      }
    }
  }
  if (!best) return null;

  const { level, trend, season } = best.fit;
  const sigma = Math.sqrt(variance(best.fit.residuals));
  const rmse = Math.sqrt(best.sse / clean.length);

  const forecasts: ForecastPoint[] = [];
  for (let h = 1; h <= horizon; h++) {
    const s = m > 1 ? season[(clean.length + h - 1) % m] : 0;
    const point = level + h * trend + s;
    const band = 1.96 * sigma * Math.sqrt(h);
    forecasts.push({
      step: h,
      value: point,
      lower: point - band,
      upper: point + band,
    });
  }

  // How much of the projected change is trend vs season?
  const trendComponent = Math.abs(horizon * trend);
  const seasonComponent =
    m > 1 ? Math.abs(season[(clean.length + horizon - 1) % m]) : 0;
  const denom = trendComponent + seasonComponent || 1;

  return {
    forecasts,
    alpha: best.alpha,
    beta: best.beta,
    gamma: best.gamma,
    rmse,
    seasonLength: m,
    trendShare: trendComponent / denom,
  };
}

/* ------------------------------------------------------------------
 * Theil-Sen robust regression
 * ------------------------------------------------------------------*/

export interface TheilSen {
  slope: number;
  intercept: number;
  /** Coefficient of determination against the robust line, 0..1. */
  r2: number;
}

/**
 * Theil-Sen estimator: slope = median of slopes over all point pairs,
 * intercept = median(y - slope*x). Robust to ~29% outliers, unlike OLS.
 * x is taken as the sample index 0..n-1.
 */
export function theilSen(y: number[]): TheilSen | null {
  const pts = y
    .map((v, i) => [i, v] as const)
    .filter(([, v]) => Number.isFinite(v));
  const n = pts.length;
  if (n < 3) return null;

  const slopes: number[] = [];
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const dx = pts[j][0] - pts[i][0];
      if (dx !== 0) slopes.push((pts[j][1] - pts[i][1]) / dx);
    }
  }
  if (slopes.length === 0) return null;
  const slope = median(slopes);
  const intercept = median(pts.map(([x, v]) => v - slope * x));

  const ys = pts.map(([, v]) => v);
  const ym = mean(ys);
  const ssTot = ys.reduce((s, v) => s + (v - ym) ** 2, 0) || 1;
  const ssRes = pts.reduce(
    (s, [x, v]) => s + (v - (slope * x + intercept)) ** 2,
    0,
  );
  const r2 = Math.max(0, 1 - ssRes / ssTot);

  return { slope, intercept, r2 };
}

function median(xs: number[]): number {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/* ------------------------------------------------------------------
 * Quota / capacity exhaustion projection
 * ------------------------------------------------------------------*/

export interface ExhaustionProjection {
  /** Steps until the series is projected to reach `limit`, or null if never. */
  stepsToLimit: number | null;
  /** Current (latest) value. */
  current: number;
  /** The hard limit. */
  limit: number;
  /** Robust slope (units per step). */
  slope: number;
  /** Fit quality of the robust trend, 0..1. */
  confidence: number;
  /** Human-readable verdict tone. */
  severity: "critical" | "warning" | "ok";
}

/**
 * Project when a growing series will hit `limit`. Uses Theil-Sen so a few
 * spiky days don't distort the ETA. Returns null stepsToLimit when the
 * trend is flat/declining (never exhausts).
 *
 * @param stepDays  Calendar days each step represents (for severity banding).
 */
export function projectExhaustion(
  y: number[],
  limit: number,
  stepDays = 1,
): ExhaustionProjection | null {
  const ts = theilSen(y);
  if (!ts) return null;
  const current = y[y.length - 1];
  const headroom = limit - current;

  let stepsToLimit: number | null = null;
  if (ts.slope > 1e-9 && headroom > 0) {
    stepsToLimit = headroom / ts.slope;
  }

  let severity: ExhaustionProjection["severity"] = "ok";
  if (stepsToLimit !== null) {
    const days = stepsToLimit * stepDays;
    if (days <= 14) severity = "critical";
    else if (days <= 45) severity = "warning";
  }

  return {
    stepsToLimit,
    current,
    limit,
    slope: ts.slope,
    confidence: ts.r2,
    severity,
  };
}
