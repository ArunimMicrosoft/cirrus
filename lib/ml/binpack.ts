/**
 * VM consolidation via bin-packing.
 *
 * Given under-utilised VMs described by their p95 resource demand (as a
 * fraction of a target host's capacity), compute how few hosts they could be
 * packed onto without any host exceeding a safety ceiling. Uses First-Fit
 * Decreasing (FFD) — the classic bin-packing heuristic that is provably
 * within 11/9·OPT + 1 bins of optimal.
 *
 * This is advisory only (read-only): it never moves anything, it shows the
 * operator the consolidation opportunity and the headroom math.
 */

export interface PackItem {
  id: string;
  label: string;
  /** Demand as a fraction of one host's usable capacity, 0..1. */
  demand: number;
}

export interface Bin {
  /** Items assigned to this bin. */
  items: PackItem[];
  /** Sum of demands in this bin, 0..ceiling. */
  used: number;
}

export interface PackResult {
  bins: Bin[];
  /** Original item count. */
  itemCount: number;
  /** Bins used after packing. */
  binsUsed: number;
  /** Hosts saved = itemCount - binsUsed (assuming 1 VM/host today). */
  hostsSaved: number;
  /** Average utilisation across packed bins, 0..1. */
  avgUtil: number;
  ceiling: number;
}

/**
 * First-Fit Decreasing. Items are placed into the first bin that can hold
 * them without exceeding `ceiling`; a new bin opens only when none fits.
 * Sorting by descending demand first is what gives FFD its tight bound.
 */
export function packFFD(items: PackItem[], ceiling = 0.7): PackResult {
  const usable = items.filter((i) => Number.isFinite(i.demand) && i.demand > 0);
  const sorted = [...usable].sort((a, b) => b.demand - a.demand);
  const bins: Bin[] = [];

  for (const item of sorted) {
    // Items bigger than the ceiling can't be consolidated — own bin.
    if (item.demand > ceiling) {
      bins.push({ items: [item], used: item.demand });
      continue;
    }
    let placed = false;
    for (const bin of bins) {
      if (bin.used + item.demand <= ceiling) {
        bin.items.push(item);
        bin.used += item.demand;
        placed = true;
        break;
      }
    }
    if (!placed) bins.push({ items: [item], used: item.demand });
  }

  const binsUsed = bins.length;
  const itemCount = usable.length;
  const avgUtil = binsUsed > 0 ? bins.reduce((s, b) => s + b.used, 0) / binsUsed : 0;

  return {
    bins,
    itemCount,
    binsUsed,
    hostsSaved: Math.max(0, itemCount - binsUsed),
    avgUtil,
    ceiling,
  };
}
