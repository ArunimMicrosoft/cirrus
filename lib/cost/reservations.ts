/**
 * Normaliser for Azure's native reservation recommendations
 * (Microsoft.Consumption/reservationRecommendations — a READ-ONLY GET).
 *
 * Azure analyses your real 7/30/60-day usage and returns, per SKU + region,
 * the recommended reserved quantity and the money you'd save. We surface those
 * authoritative numbers instead of estimating from list prices. This module is
 * pure (no I/O) so it is trivially testable.
 *
 * The API returns two shapes:
 *   - "legacy" (EA / pay-as-you-go): sku + location at the top level, money
 *     fields are plain numbers, lookBackPeriod is a string.
 *   - "modern" (MCA / MPA): money fields are { currency, value } objects,
 *     location/skuName live under properties, lookBackPeriod is a number.
 *
 * Cost figures are normalised by Azure to a ~monthly period (totalHours ≈ 730),
 * matching what the portal shows, so annual savings = monthly × 12.
 */

/** A single money field that may be a plain number (legacy) or object (modern). */
type Money = number | { currency?: string; value?: number } | null | undefined;

export interface RawReservationRecommendation {
  sku?: string;
  location?: string;
  kind?: string;
  properties?: {
    netSavings?: Money;
    costWithNoReservedInstances?: Money;
    totalCostWithReservedInstances?: Money;
    recommendedQuantity?: number;
    term?: string; // "P1Y" | "P3Y"
    scope?: string; // "Single" | "Shared"
    lookBackPeriod?: string | number;
    resourceType?: string;
    skuName?: string;
    location?: string;
    totalHours?: number;
  };
}

export interface NormalisedReservation {
  sku: string;
  region: string;
  /** Human term label. */
  term: "1-year" | "3-year";
  scope: string;
  lookbackDays: number;
  resourceType: string;
  quantity: number;
  monthlySavings: number;
  annualSavings: number;
  monthlyOnDemand: number;
  monthlyWithReservation: number;
  /** Break-even utilisation the reservation implies (0..1), or null if unknown. */
  breakEvenFraction: number | null;
  currency: string;
}

const MONTHS_PER_YEAR = 12;

function money(v: Money): { value: number; currency: string } {
  if (typeof v === "number") return { value: v, currency: "" };
  if (v && typeof v === "object") {
    return { value: v.value ?? 0, currency: v.currency ?? "" };
  }
  return { value: 0, currency: "" };
}

function lookbackDays(lb: string | number | undefined): number {
  if (typeof lb === "number") return lb;
  if (lb === "Last60Days") return 60;
  if (lb === "Last30Days") return 30;
  return 7; // Last7Days (the API default)
}

function termLabel(term: string | undefined): "1-year" | "3-year" {
  return term === "P3Y" ? "3-year" : "1-year";
}

function toNormalised(r: RawReservationRecommendation): NormalisedReservation {
  const p = r.properties ?? {};
  const net = money(p.netSavings);
  const onDemand = money(p.costWithNoReservedInstances);
  const withRi = money(p.totalCostWithReservedInstances);
  const currency = net.currency || onDemand.currency || withRi.currency || "";

  // On-demand > 0 lets us express the reservation's break-even as the fraction
  // of on-demand spend the reserved commitment represents.
  const breakEvenFraction =
    onDemand.value > 0 ? Math.min(1, withRi.value / onDemand.value) : null;

  return {
    sku: r.sku ?? p.skuName ?? "unknown",
    region: r.location ?? p.location ?? "",
    term: termLabel(p.term),
    scope: p.scope ?? "Single",
    lookbackDays: lookbackDays(p.lookBackPeriod),
    resourceType: p.resourceType ?? "",
    quantity: p.recommendedQuantity ?? 0,
    monthlySavings: net.value,
    annualSavings: net.value * MONTHS_PER_YEAR,
    monthlyOnDemand: onDemand.value,
    monthlyWithReservation: withRi.value,
    breakEvenFraction,
    currency,
  };
}

/**
 * Normalise the raw recommendation list into one clean row per (SKU, region):
 * subscription-scoped ("Single") recommendations are preferred, and for each
 * SKU+region we keep the term/look-back that Azure found the most savings for.
 */
export function normaliseReservationRecommendations(
  raw: RawReservationRecommendation[],
): NormalisedReservation[] {
  const all = raw.map(toNormalised);

  // Prefer subscription-scoped recommendations; fall back to whatever exists.
  const singles = all.filter((r) => r.scope.toLowerCase() === "single");
  const pool = singles.length ? singles : all;

  // Keep the best-saving recommendation per (SKU, region).
  const best = new Map<string, NormalisedReservation>();
  for (const r of pool) {
    if (r.annualSavings <= 0 && r.quantity <= 0) continue;
    const key = `${r.sku}|${r.region}`;
    const cur = best.get(key);
    if (!cur || r.annualSavings > cur.annualSavings) best.set(key, r);
  }

  return [...best.values()].sort((a, b) => b.annualSavings - a.annualSavings);
}

export interface ReservationSummary {
  count: number;
  totalAnnualSavings: number;
  totalMonthlySavings: number;
  currency: string;
}

export function summariseReservations(
  rows: NormalisedReservation[],
): ReservationSummary {
  return {
    count: rows.length,
    totalAnnualSavings: rows.reduce((s, r) => s + r.annualSavings, 0),
    totalMonthlySavings: rows.reduce((s, r) => s + r.monthlySavings, 0),
    currency: rows.find((r) => r.currency)?.currency ?? "",
  };
}
