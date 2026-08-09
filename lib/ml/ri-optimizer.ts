/**
 * Reserved Instance / Savings Plan break-even optimisation.
 *
 * Given a fleet of VMs grouped by (SKU, region) with observed running
 * fractions, and the PAYG / 1-yr / 3-yr rates for each, decide the
 * cost-minimising commitment mix. This is a per-group break-even decision:
 * a reservation is worth it only when the group's committed running hours
 * exceed the break-even utilisation implied by the discount.
 *
 * The core is a deterministic optimisation (not a heuristic label): for each
 * group we compute expected annual cost under PAYG, 1-yr, and 3-yr and pick
 * the minimum, but we only commit as many reserved units as the p20 (floor)
 * of concurrently-running instances so we never over-commit. Pure math.
 */

export interface SkuGroup {
  sku: string;
  region: string;
  /** Number of VMs in this group. */
  count: number;
  /** Per-instance running fraction 0..1 (e.g. 0.72 = up 72% of the time). */
  runningFraction: number;
  /** Conservative floor of always-on instances (e.g. p20 of concurrency). */
  alwaysOn: number;
  paygHourly: number;
  ri1yHourly: number | null;
  ri3yHourly: number | null;
}

export type Commitment = "payg" | "ri1y" | "ri3y";

export interface GroupPlan {
  sku: string;
  region: string;
  /** Number of VMs in this group. */
  count: number;
  /** Reserved units to buy (never exceeds alwaysOn). */
  reservedUnits: number;
  term: Commitment;
  /** Current all-PAYG annual cost for the group. */
  paygAnnual: number;
  /** Optimised annual cost with the recommended commitment. */
  optimisedAnnual: number;
  /** Annual saving (>=0). */
  saving: number;
  /** Break-even running fraction at which the reservation pays off. */
  breakEvenFraction: number;
  /** Whether the group's utilisation clears break-even with margin. */
  confident: boolean;
  /** Whether Azure sells a reservation for this SKU/region at all. Older
   *  series (e.g. Dsv3) are PAYG-only — no reservation can be purchased. */
  riAvailable: boolean;
  reason: string;
}

const HOURS_PER_YEAR = 8760;

/**
 * Optimise one group. Compares annual PAYG for `count` instances at the
 * observed running fraction against reserving `alwaysOn` units (which run
 * 24×7 by definition of a reservation) plus PAYG for the remaining variable
 * capacity.
 */
export function optimiseGroup(g: SkuGroup): GroupPlan {
  const runHours = HOURS_PER_YEAR * g.runningFraction;
  const paygAnnual = g.count * runHours * g.paygHourly;

  // Evaluate each reservable term; a reservation bills 24×7 regardless of use.
  const options: Array<{ term: Commitment; annual: number; units: number; rate: number | null }> = [
    { term: "payg", annual: paygAnnual, units: 0, rate: g.paygHourly },
  ];

  const evalTerm = (term: Commitment, rate: number | null) => {
    if (rate == null || g.alwaysOn <= 0) return;
    const reserved = g.alwaysOn;
    const variable = g.count - reserved;
    // Reserved units: pay the reserved rate 24×7.
    const reservedAnnual = reserved * HOURS_PER_YEAR * rate;
    // Variable units: stay on PAYG at the observed running fraction.
    const variableAnnual = Math.max(0, variable) * runHours * g.paygHourly;
    options.push({ term, annual: reservedAnnual + variableAnnual, units: reserved, rate });
  };
  evalTerm("ri1y", g.ri1yHourly);
  evalTerm("ri3y", g.ri3yHourly);

  const best = options.reduce((a, b) => (b.annual < a.annual ? b : a));

  // Break-even fraction for the chosen term (rate/payg = fraction at which a
  // 24×7 reservation costs the same as PAYG running that fraction).
  const breakEvenFraction =
    best.rate != null && g.paygHourly > 0 ? best.rate / g.paygHourly : 1;

  const saving = Math.max(0, paygAnnual - best.annual);
  const confident = g.runningFraction >= breakEvenFraction + 0.1 && g.alwaysOn >= 1;
  const riAvailable = g.ri1yHourly != null || g.ri3yHourly != null;

  let reason: string;
  if (!riAvailable) {
    reason = `Azure doesn't sell a reservation for ${g.sku} — this series is pay-as-you-go only.`;
  } else if (best.term === "payg") {
    reason = `Utilisation (${(g.runningFraction * 100).toFixed(0)}%) is below the ${(breakEvenFraction * 100).toFixed(0)}% break-even — stay on PAYG.`;
  } else {
    reason = `${g.alwaysOn} unit(s) run ~24×7; reserving on a ${best.term === "ri3y" ? "3-year" : "1-year"} term beats PAYG above ${(breakEvenFraction * 100).toFixed(0)}% utilisation.`;
  }

  return {
    sku: g.sku,
    region: g.region,
    count: g.count,
    reservedUnits: best.units,
    term: best.term,
    paygAnnual,
    optimisedAnnual: best.annual,
    saving,
    breakEvenFraction,
    confident,
    riAvailable,
    reason,
  };
}

export interface FleetPlan {
  groups: GroupPlan[];
  totalPaygAnnual: number;
  totalOptimisedAnnual: number;
  totalSaving: number;
  /** Saving we're confident about (utilisation clears break-even with margin). */
  confidentSaving: number;
}

/** Optimise a whole fleet and roll up totals. */
export function optimiseFleet(groups: SkuGroup[]): FleetPlan {
  const plans = groups.map(optimiseGroup).sort((a, b) => b.saving - a.saving);
  const totalPaygAnnual = plans.reduce((s, p) => s + p.paygAnnual, 0);
  const totalOptimisedAnnual = plans.reduce((s, p) => s + p.optimisedAnnual, 0);
  const totalSaving = plans.reduce((s, p) => s + p.saving, 0);
  const confidentSaving = plans
    .filter((p) => p.confident)
    .reduce((s, p) => s + p.saving, 0);
  return {
    groups: plans,
    totalPaygAnnual,
    totalOptimisedAnnual,
    totalSaving,
    confidentSaving,
  };
}
