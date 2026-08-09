/**
 * Rarity-based drift risk scoring.
 *
 * The static RISKY/NOTABLE/benign rules in drift-risk.ts encode universal
 * security truths. This module adds a *learned* layer on top: it models how
 * common each kind of change is for THIS tenant (from accumulated drift
 * history) and boosts the risk of change-types that are rare here.
 *
 * Intuition: a tag edit happens constantly → low novelty. A storage account
 * flipping to public has never happened in this tenant → high novelty, worth
 * a closer look even if the base rule already flags it.
 *
 * Pure math over history the browser already stored. No writes, no network.
 */

export interface ChangeObservation {
  /** e.g. "Storage:MODIFY:allowBlobPublicAccess" — a change-type signature. */
  signature: string;
}

export interface RarityModel {
  /** Total observations the model was built from. */
  total: number;
  /** Count per signature. */
  counts: Record<string, number>;
}

/** Build a frequency model from historical change signatures. */
export function buildRarityModel(history: ChangeObservation[]): RarityModel {
  const counts: Record<string, number> = {};
  for (const o of history) {
    counts[o.signature] = (counts[o.signature] ?? 0) + 1;
  }
  return { total: history.length, counts };
}

/**
 * Novelty of a signature: 0 (extremely common) .. 1 (never seen before).
 * Uses a smoothed inverse-frequency so a signature seen once in 1000 changes
 * still scores high, and one seen 400/1000 scores low.
 *
 *   novelty = 1 - (count + 1) / (total + 2)   [Laplace-smoothed frequency]
 * then sharpened with a log so the tail (rare events) separates cleanly.
 */
export function novelty(model: RarityModel, signature: string): number {
  const count = model.counts[signature] ?? 0;
  const freq = (count + 1) / (model.total + 2);
  // Map frequency → novelty with a log curve; clamp to 0..1.
  const raw = -Math.log(freq) / Math.log(model.total + 2);
  return Math.max(0, Math.min(1, raw)) * (1 - freq);
}

export type BaseRisk = "RISKY" | "NOTABLE" | "BENIGN";
export type AdjustedRisk = "CRITICAL" | "RISKY" | "NOTABLE" | "BENIGN";

export interface AdjustedFinding {
  risk: AdjustedRisk;
  novelty: number;
  /** True when rarity pushed the base risk up a level. */
  boosted: boolean;
  note: string;
}

/**
 * Combine the base (rules-based) risk with the learned novelty. A rare
 * occurrence of an already-risky change is escalated to CRITICAL; a rare
 * NOTABLE becomes RISKY; common changes keep their base level.
 */
export function adjustRisk(
  base: BaseRisk,
  model: RarityModel,
  signature: string,
): AdjustedFinding {
  const nov = novelty(model, signature);
  const rare = nov >= 0.6 && model.total >= 10;

  if (base === "RISKY" && rare) {
    return {
      risk: "CRITICAL",
      novelty: nov,
      boosted: true,
      note: `Risky change that is unprecedented in this tenant (novelty ${(nov * 100).toFixed(0)}%).`,
    };
  }
  if (base === "NOTABLE" && rare) {
    return {
      risk: "RISKY",
      novelty: nov,
      boosted: true,
      note: `Unusual change-type for this tenant (novelty ${(nov * 100).toFixed(0)}%) — review.`,
    };
  }
  return {
    risk: base,
    novelty: nov,
    boosted: false,
    note:
      model.total < 10
        ? "Not enough history yet to judge rarity."
        : `Change-type is ${nov < 0.3 ? "common" : "occasional"} here (novelty ${(nov * 100).toFixed(0)}%).`,
  };
}
