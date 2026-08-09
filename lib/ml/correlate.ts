/**
 * Time-lagged correlation between metric anomalies and activity-log events.
 *
 * Answers "what changed right before this spike?" by testing whether
 * activity-log events cluster in the minutes preceding metric anomalies more
 * than chance would predict. Pure signal processing over already-fetched
 * data (Azure Monitor metrics + activity log). No writes.
 */

export interface TimePoint {
  time: string; // ISO
  value: number;
}

export interface ActivityEvent {
  time: string; // ISO
  operation: string;
  caller?: string;
}

export interface CorrelationHit {
  /** The metric anomaly timestamp. */
  anomalyTime: string;
  anomalyValue: number;
  /** The event that best precedes it. */
  event: ActivityEvent;
  /** Lead time in minutes (event happened this many minutes before spike). */
  leadMinutes: number;
}

export interface CorrelationResult {
  hits: CorrelationHit[];
  /** Number of metric anomalies detected. */
  anomalyCount: number;
  /**
   * Association strength 0..1: fraction of anomalies that have a preceding
   * event within the window. Higher = events more likely explain spikes.
   */
  association: number;
}

/** Robust anomaly flags via MAD (median absolute deviation) z-scores. */
function anomalyIndices(values: number[], zThresh = 3.5): number[] {
  const finite = values.filter((v) => Number.isFinite(v));
  if (finite.length < 4) return [];
  const sorted = [...finite].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  const absDev = finite.map((v) => Math.abs(v - median)).sort((a, b) => a - b);
  const mad = absDev[Math.floor(absDev.length / 2)] || 1e-9;
  const out: number[] = [];
  values.forEach((v, i) => {
    if (!Number.isFinite(v)) return;
    // 0.6745 scales MAD to be comparable to the std of a normal dist.
    const z = (0.6745 * (v - median)) / mad;
    if (z >= zThresh) out.push(i);
  });
  return out;
}

/**
 * Correlate. For each metric anomaly, find the closest activity event that
 * occurred within `windowMinutes` *before* it. Association is the share of
 * anomalies with such a preceding event.
 */
export function correlateEvents(
  series: TimePoint[],
  events: ActivityEvent[],
  opts: { windowMinutes?: number; zThreshold?: number } = {},
): CorrelationResult {
  const windowMs = (opts.windowMinutes ?? 30) * 60_000;
  const values = series.map((p) => p.value);
  const anomIdx = anomalyIndices(values, opts.zThreshold ?? 3.5);

  const eventTimes = events
    .map((e) => ({ e, t: Date.parse(e.time) }))
    .filter((x) => Number.isFinite(x.t))
    .sort((a, b) => a.t - b.t);

  const hits: CorrelationHit[] = [];
  for (const i of anomIdx) {
    const anomT = Date.parse(series[i].time);
    if (!Number.isFinite(anomT)) continue;
    // Closest event strictly before the anomaly, within the window.
    let best: { e: ActivityEvent; lead: number } | null = null;
    for (const { e, t } of eventTimes) {
      if (t > anomT) break;
      const lead = anomT - t;
      if (lead >= 0 && lead <= windowMs) {
        if (!best || lead < best.lead) best = { e, lead };
      }
    }
    if (best) {
      hits.push({
        anomalyTime: series[i].time,
        anomalyValue: series[i].value,
        event: best.e,
        leadMinutes: Math.round(best.lead / 60_000),
      });
    }
  }

  return {
    hits,
    anomalyCount: anomIdx.length,
    association: anomIdx.length > 0 ? hits.length / anomIdx.length : 0,
  };
}
