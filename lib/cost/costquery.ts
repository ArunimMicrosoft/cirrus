/**
 * Parser for the Azure Cost Management Query response into a clean daily
 * spend series. Pure (no I/O) so it is trivially testable and runs anywhere.
 *
 * The Query API returns a compact table:
 *   properties.columns: [{ name: "Cost", type }, { name: "UsageDate" }, { name: "Currency" }]
 *   properties.rows:    [[ 12.34, 20240115, "USD" ], ...]
 * UsageDate is an integer yyyymmdd for Daily granularity (yyyymm for Monthly).
 *
 * We locate columns by name (resilient to metric-name variants like
 * PreTaxCost / CostUSD and to column ordering) and never invent values.
 */

export interface CostQueryResponse {
  properties?: {
    columns?: Array<{ name: string; type?: string }>;
    rows?: Array<Array<string | number>>;
    nextLink?: string | null;
  };
}

export interface CostPoint {
  /** Local calendar date, YYYY-MM-DD. */
  date: string;
  /** Cost for that day in the billing currency. */
  cost: number;
}

export interface CostSeries {
  points: CostPoint[];
  currency: string;
  total: number;
  /** True when the response contained a usable cost + date column. */
  usable: boolean;
}

const COST_NAMES = ["cost", "pretaxcost", "costusd", "pretaxcostusd", "amortizedcost"];

function findCostIndex(columns: Array<{ name: string; type?: string }>): number {
  const lower = columns.map((c) => c.name.toLowerCase());
  for (const want of COST_NAMES) {
    const i = lower.indexOf(want);
    if (i >= 0) return i;
  }
  // Fall back to the first numeric column that isn't a date/quantity key.
  return columns.findIndex(
    (c) =>
      (c.type ?? "").toLowerCase() === "number" &&
      !/date|month|quantity/i.test(c.name),
  );
}

/** Normalise a UsageDate cell (20240115 or "2024-01-15..." ) to YYYY-MM-DD. */
function normaliseDate(cell: string | number | undefined): string | null {
  if (cell == null) return null;
  if (typeof cell === "number" && Number.isFinite(cell)) {
    const s = String(Math.trunc(cell));
    if (s.length === 8) return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
    if (s.length === 6) return `${s.slice(0, 4)}-${s.slice(4, 6)}-01`;
    return null;
  }
  const str = String(cell);
  // ISO or date-like string.
  const m = str.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  if (/^\d{8}$/.test(str)) return `${str.slice(0, 4)}-${str.slice(4, 6)}-${str.slice(6, 8)}`;
  return null;
}

export function parseCostQuery(resp: CostQueryResponse): CostSeries {
  const columns = resp.properties?.columns ?? [];
  const rows = resp.properties?.rows ?? [];

  const idxCost = findCostIndex(columns);
  const idxDate = columns.findIndex((c) => /usagedate|billingmonth|date|month/i.test(c.name));
  const idxCurrency = columns.findIndex((c) => /currency/i.test(c.name));

  if (idxCost < 0 || idxDate < 0) {
    return { points: [], currency: "", total: 0, usable: false };
  }

  const byDate = new Map<string, number>();
  let currency = "";
  for (const row of rows) {
    const date = normaliseDate(row[idxDate]);
    if (!date) continue;
    const raw = Number(row[idxCost]);
    const cost = Number.isFinite(raw) ? raw : 0;
    byDate.set(date, (byDate.get(date) ?? 0) + cost);
    if (idxCurrency >= 0 && !currency) currency = String(row[idxCurrency] ?? "");
  }

  const points: CostPoint[] = [...byDate.entries()]
    .map(([date, cost]) => ({ date, cost }))
    .sort((a, b) => (a.date < b.date ? -1 : 1));

  const total = points.reduce((s, p) => s + p.cost, 0);
  return { points, currency, total, usable: true };
}

/** Sum the cost over the most recent `days` points of a daily series. */
export function sumLastDays(series: CostSeries, days: number): number {
  return series.points.slice(-days).reduce((s, p) => s + p.cost, 0);
}
