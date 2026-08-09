"use client";

import * as React from "react";
import { TrendingUp, Coins, Boxes, LineChart as LineIcon, ShieldAlert } from "lucide-react";
import { PageHeader } from "@/components/data/PageHeader";
import { NoSubscriptionState } from "@/components/data/NoSubscriptionState";
import { StatCard } from "@/components/data/StatCard";
import { AlgorithmBadge } from "@/components/data/AlgorithmBadge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useArmList } from "@/lib/hooks/use-arm";
import { useVmPrices } from "@/lib/hooks/use-vm-prices";
import { useReservationRecommendations } from "@/lib/hooks/use-reservations";
import { useCostHistory } from "@/lib/hooks/use-cost-history";
import { sumLastDays } from "@/lib/cost/costquery";
import { useSubscriptionStore } from "@/lib/hooks/use-subscription";
import { ArmApi } from "@/lib/azure/arm";
import { formatCurrency } from "@/lib/utils";
import { holtWintersForecast, theilSen } from "@/lib/ml/forecast";
import { optimiseFleet, type SkuGroup } from "@/lib/ml/ri-optimizer";
import { packFFD, type PackItem } from "@/lib/ml/binpack";
import type { VirtualMachine } from "@/lib/azure/types";

export default function CostIntelligencePage() {
  const activeId = useSubscriptionStore((s) => s.activeId);
  const activeName = useSubscriptionStore((s) => s.activeName);

  const vms = useArmList<VirtualMachine>(
    "/providers/Microsoft.Compute/virtualMachines",
    ArmApi.computeVms,
  );
  const vmList = vms.data?.value ?? [];

  // Azure's own reservation recommendations (authoritative, from real usage).
  // Read-only GET against Microsoft.Consumption. Falls back to the break-even
  // estimate below when Azure has no recommendation for this subscription.
  const reservations = useReservationRecommendations();

  const pricePairs = vmList
    .map((vm) => ({
      size: vm.properties?.hardwareProfile?.vmSize ?? "",
      region: vm.location,
    }))
    .filter((p) => p.size);
  const prices = useVmPrices(pricePairs, true);

  // ---- Real daily spend history from Azure Cost Management ----
  // Actual billed cost, last 90 days. Available on the first login from any
  // device — no browser history to accumulate. Requires Cost Management Reader.
  const costHistory = useCostHistory(90);
  const costSeries = React.useMemo(
    () => costHistory.series?.points.map((p) => p.cost) ?? [],
    [costHistory.series],
  );
  const currency = costHistory.series?.currency || "USD";

  // Holt-Winters forecast of the next 30 days of ACTUAL spend, 95% band.
  const forecast = React.useMemo(
    () => (costSeries.length >= 4 ? holtWintersForecast(costSeries, 30) : null),
    [costSeries],
  );
  // Theil-Sen robust $/day trend — median of pairwise slopes, spike-resistant.
  const robustTrend = React.useMemo(
    () => (costSeries.length >= 3 ? theilSen(costSeries) : null),
    [costSeries],
  );

  const spend30 = costHistory.series ? sumLastDays(costHistory.series, 30) : 0;
  const lastDaySpend = costSeries.length ? costSeries[costSeries.length - 1] : 0;
  const forecastNext30 = forecast
    ? forecast.forecasts.reduce((s, f) => s + Math.max(0, f.value), 0)
    : null;
  const forecastLow30 = forecast
    ? forecast.forecasts.reduce((s, f) => s + Math.max(0, f.lower), 0)
    : null;
  const forecastHigh30 = forecast
    ? forecast.forecasts.reduce((s, f) => s + Math.max(0, f.upper), 0)
    : null;

  // ---- RI optimisation: group by (size, region) ----
  const fleetPlan = React.useMemo(() => {
    const groups = new Map<string, SkuGroup>();
    for (const vm of vmList) {
      const size = vm.properties?.hardwareProfile?.vmSize ?? "";
      if (!size) continue;
      const key = `${size}|${vm.location}`;
      const rate = prices.map.get(key);
      if (!rate?.paygHourly) continue;
      const g = groups.get(key) ?? {
        sku: size,
        region: vm.location,
        count: 0,
        runningFraction: 0.85, // conservative default without per-VM uptime
        alwaysOn: 0,
        paygHourly: rate.paygHourly,
        ri1yHourly: rate.ri1yHourly,
        ri3yHourly: rate.ri3yHourly,
      };
      g.count += 1;
      groups.set(key, g);
    }
    // alwaysOn = round(count * runningFraction) — the reservable steady core.
    // Rounding (not floor) so a single VM up ~85% of the time is still treated
    // as a reservation candidate; flooring zeroed out every single-VM group.
    for (const g of groups.values()) {
      g.alwaysOn = Math.round(g.count * g.runningFraction);
    }
    return optimiseFleet([...groups.values()]);
  }, [vmList, prices.map]);

  // ---- Consolidation opportunity (demand as fraction of a host) ----
  // Without per-VM metrics here we approximate demand by relative SKU size;
  // the Workload Intelligence page does the metric-driven version. This shows
  // the packing opportunity for the current fleet's nominal footprint.
  const packResult = React.useMemo(() => {
    const items: PackItem[] = vmList.map((vm) => {
      const size = (vm.properties?.hardwareProfile?.vmSize ?? "").toLowerCase();
      // crude vCPU proxy from SKU digits; falls back to 0.25 of a host.
      const m = size.match(/_[a-z]*(\d+)/);
      const vcpu = m ? Math.min(64, parseInt(m[1], 10) || 2) : 2;
      return { id: vm.id, label: vm.name, demand: Math.min(0.9, vcpu / 32) };
    });
    return packFFD(items, 0.7);
  }, [vmList]);

  if (!activeId) return <NoSubscriptionState />;

  return (
    <>
      <PageHeader
        icon={<TrendingUp className="h-5 w-5" />}
        title="Cost Intelligence"
        description={`Actual-spend forecasting, reservation optimisation, and consolidation for ${activeName ?? "this subscription"}. Live from Azure Cost Management — read-only.`}
      />

      <AlgorithmBadge keys={["costForecast", "theilSen", "riOptimizer", "binPacking"]} />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard
          label="Actual spend · 30d"
          value={costHistory.series ? fmtCost(spend30, currency) : "—"}
          delta={costHistory.rateLimited ? "rate-limited · retrying" : "live · Azure Cost Management"}
          icon={<TrendingUp className="h-4 w-4" />}
          loading={costHistory.isLoading}
        />
        <StatCard
          label="Reservation saving / yr"
          value={formatCurrency(
            reservations.hasData
              ? reservations.summary.totalAnnualSavings
              : fleetPlan.confidentSaving,
          )}
          delta={
            reservations.hasData
              ? `Azure · ${reservations.summary.count} recommendation${reservations.summary.count === 1 ? "" : "s"}`
              : `est · of ${formatCurrency(fleetPlan.totalSaving)} total`
          }
          deltaTone={
            (reservations.hasData
              ? reservations.summary.totalAnnualSavings
              : fleetPlan.confidentSaving) > 0
              ? "positive"
              : "default"
          }
          icon={<Coins className="h-4 w-4" />}
          loading={reservations.isLoading || prices.anyLoading}
        />
        <StatCard
          label="Consolidation"
          value={`${packResult.hostsSaved} hosts`}
          delta={`${packResult.itemCount} → ${packResult.binsUsed} @ ${(packResult.ceiling * 100).toFixed(0)}% cap`}
          deltaTone={packResult.hostsSaved > 0 ? "positive" : "default"}
          icon={<Boxes className="h-4 w-4" />}
          loading={vms.isLoading}
        />
        <StatCard
          label="Spend forecast · next 30d"
          value={forecastNext30 != null ? fmtCost(forecastNext30, currency) : "—"}
          delta={
            forecast
              ? `season ${forecast.seasonLength}d · RMSE ${forecast.rmse.toFixed(1)}`
              : costHistory.needsRole
                ? "needs Cost Management Reader"
                : costHistory.rateLimited
                  ? "rate-limited · retrying"
                  : "needs 4+ billing days"
          }
          icon={<LineIcon className="h-4 w-4" />}
          loading={costHistory.isLoading}
        />
      </div>

      {/* Spend forecast — Holt-Winters over real daily cost */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm font-semibold">
            <LineIcon className="h-4 w-4 text-primary" />
            Spend forecast — Holt-Winters on actual daily cost
          </CardTitle>
        </CardHeader>
        <CardContent className="pb-4">
          {costHistory.isLoading ? (
            <p className="text-sm text-muted-foreground">
              Loading actual cost history from Azure Cost Management…
            </p>
          ) : costHistory.needsRole ? (
            <Alert>
              <ShieldAlert className="h-4 w-4" />
              <AlertTitle>Grant the Cost Management Reader role</AlertTitle>
              <AlertDescription>
                Live spend comes from the Azure Cost Management API, which needs
                the <strong>Cost Management Reader</strong> role — the plain
                Reader role can query resources but not billing. Assign it to
                the identity you signed in with (subscription scope is enough)
                and this forecast fills in immediately. Meridian only ever reads
                cost data; it never changes anything.
              </AlertDescription>
            </Alert>
          ) : costHistory.rateLimited ? (
            <Alert>
              <ShieldAlert className="h-4 w-4" />
              <AlertTitle>Azure is rate-limiting cost queries</AlertTitle>
              <AlertDescription>
                The Cost Management API allows only a few queries per minute.
                Meridian caches each result for 6 hours to stay within that
                limit, so this usually clears in under a minute.{" "}
                <button
                  type="button"
                  onClick={() => costHistory.refetch()}
                  className="font-medium text-primary underline underline-offset-2"
                >
                  Retry now
                </button>
                .
              </AlertDescription>
            </Alert>
          ) : costHistory.isError ? (
            <Alert variant="destructive">
              <ShieldAlert className="h-4 w-4" />
              <AlertTitle>Couldn&apos;t load cost history</AlertTitle>
              <AlertDescription>{costHistory.error?.message}</AlertDescription>
            </Alert>
          ) : forecast ? (
            <>
              <Sparkline history={costSeries} forecast={forecast.forecasts.map((f) => f.value)} />
              <div className="mt-3 grid grid-cols-2 gap-3 text-sm md:grid-cols-4">
                <Metric k="Latest day" v={fmtCost(lastDaySpend, currency, 2)} />
                <Metric
                  k="Next 30 days"
                  v={forecastNext30 != null ? fmtCost(forecastNext30, currency) : "—"}
                />
                <Metric
                  k="30-day range"
                  v={
                    forecastLow30 != null && forecastHigh30 != null
                      ? `${fmtCost(forecastLow30, currency)}–${fmtCost(forecastHigh30, currency)}`
                      : "—"
                  }
                />
                <Metric k="Trend share" v={`${(forecast.trendShare * 100).toFixed(0)}%`} />
              </div>
              <p className="mt-3 text-xs text-muted-foreground">
                Forecasts your <span className="text-foreground">actual billed spend</span>{" "}
                for the next 30 days with a 95% prediction band, from{" "}
                {costSeries.length} days of Cost Management history.{" "}
                {forecast.seasonLength > 1
                  ? `Detected a ${forecast.seasonLength}-day spend cycle.`
                  : "No strong weekly cycle detected."}
              </p>
              {robustTrend && (
                <p className="mt-1 text-xs text-muted-foreground">
                  Theil-Sen robust trend:{" "}
                  <span className="font-medium text-foreground">
                    {robustTrend.slope >= 0 ? "+" : ""}
                    {fmtCost(robustTrend.slope, currency, 2)}/day
                  </span>{" "}
                  (R² {robustTrend.r2.toFixed(2)}) — median-of-slopes, resistant
                  to one-off spikes that would skew a least-squares line.
                </p>
              )}
            </>
          ) : (
            <Alert>
              <AlertTitle>Not enough billing history yet</AlertTitle>
              <AlertDescription>
                This subscription has fewer than 4 days of billed cost. The
                forecast activates automatically once a few days of spend have
                accrued — no action needed.
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      {/* Reservation recommendations — Azure Consumption (authoritative),
          with the list-price break-even optimiser as a labelled fallback. */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm font-semibold">
            <Coins className="h-4 w-4 text-primary" />
            Reservation optimiser — savings per (SKU, region)
          </CardTitle>
        </CardHeader>
        <CardContent className="pb-4">
          {reservations.isLoading ? (
            <p className="text-sm text-muted-foreground">
              Loading Azure reservation recommendations…
            </p>
          ) : reservations.hasData ? (
            <>
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <Badge variant="success">Azure Consumption</Badge>
                <span className="text-[11px] text-muted-foreground">
                  Computed by Azure from your real usage — read-only.
                </span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[680px] text-sm">
                  <thead className="border-b text-[11px] uppercase tracking-wider text-muted-foreground">
                    <tr>
                      <th className="px-2 py-1.5 text-left">SKU · Region</th>
                      <th className="px-2 py-1.5 text-right">Qty</th>
                      <th className="px-2 py-1.5 text-left">Term</th>
                      <th className="px-2 py-1.5 text-right">Look-back</th>
                      <th className="px-2 py-1.5 text-right">Break-even</th>
                      <th className="px-2 py-1.5 text-right">Saving/yr</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reservations.recommendations.map((r) => (
                      <tr
                        key={`${r.sku}-${r.region}-${r.term}`}
                        className="border-b last:border-0"
                      >
                        <td className="px-2 py-1.5">
                          <span className="font-mono text-[11px]">{r.sku}</span>
                          {r.region && (
                            <span className="ml-1 text-[11px] text-muted-foreground">
                              {r.region}
                            </span>
                          )}
                        </td>
                        <td className="px-2 py-1.5 text-right font-medium tabular-nums">
                          {r.quantity}
                        </td>
                        <td className="px-2 py-1.5">
                          <Badge variant={r.term === "3-year" ? "success" : "outline"}>
                            {r.term === "3-year" ? "3-yr RI" : "1-yr RI"}
                          </Badge>
                        </td>
                        <td className="px-2 py-1.5 text-right tabular-nums text-muted-foreground">
                          {r.lookbackDays}d
                        </td>
                        <td className="px-2 py-1.5 text-right tabular-nums text-muted-foreground">
                          {r.breakEvenFraction != null
                            ? `${(r.breakEvenFraction * 100).toFixed(0)}%`
                            : "—"}
                        </td>
                        <td className="px-2 py-1.5 text-right font-semibold tabular-nums text-success">
                          {fmtMoney(r.annualSavings, r.currency)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="mt-3 text-xs text-muted-foreground">
                Azure analyses your last 7–60 days of usage and recommends the
                reserved quantity and term that saves the most. Savings are
                annualised from Azure&apos;s monthly figure (×12). Purchase
                reservations in the Azure Portal — Meridian never makes changes.
              </p>
            </>
          ) : (
            <>
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <Badge variant="outline">Estimated</Badge>
                <span className="text-[11px] text-muted-foreground">
                  {reservations.isError
                    ? "Azure reservation recommendations aren't available on this subscription — showing a list-price break-even estimate."
                    : "Azure has no reservation recommendation for this subscription yet — showing a list-price break-even estimate."}
                </span>
              </div>
              {fleetPlan.groups.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  {prices.anyLoading ? "Pricing…" : "No priced VM groups to optimise."}
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[640px] text-sm">
                    <thead className="border-b text-[11px] uppercase tracking-wider text-muted-foreground">
                      <tr>
                        <th className="px-2 py-1.5 text-left">SKU · Region</th>
                        <th className="px-2 py-1.5 text-right">Count</th>
                        <th className="px-2 py-1.5 text-left">Recommendation</th>
                        <th className="px-2 py-1.5 text-right">Break-even</th>
                        <th className="px-2 py-1.5 text-right">Saving/yr</th>
                      </tr>
                    </thead>
                    <tbody>
                      {fleetPlan.groups.map((g) => (
                        <tr key={`${g.sku}-${g.region}`} className="border-b last:border-0">
                          <td className="px-2 py-1.5">
                            <span className="font-mono text-[11px]">{g.sku}</span>
                            <span className="ml-1 text-[11px] text-muted-foreground">{g.region}</span>
                          </td>
                          <td className="px-2 py-1.5 text-right tabular-nums">
                            <span className="font-medium text-foreground">{g.count}</span>
                            {g.reservedUnits > 0 && (
                              <span className="ml-1 text-[11px] text-muted-foreground">
                                ({g.reservedUnits} reserved)
                              </span>
                            )}
                          </td>
                          <td className="px-2 py-1.5">
                            {!g.riAvailable ? (
                              <Badge variant="secondary" title={g.reason}>
                                No RI for this SKU
                              </Badge>
                            ) : g.term === "payg" ? (
                              <Badge variant="outline">Stay PAYG</Badge>
                            ) : (
                              <Badge variant={g.confident ? "success" : "warning"}>
                                {g.term === "ri3y" ? "3-yr RI" : "1-yr RI"}
                                {!g.confident && " (verify)"}
                              </Badge>
                            )}
                          </td>
                          <td className="px-2 py-1.5 text-right tabular-nums text-muted-foreground">
                            {g.riAvailable ? `${(g.breakEvenFraction * 100).toFixed(0)}%` : "—"}
                          </td>
                          <td className="px-2 py-1.5 text-right font-semibold tabular-nums text-success">
                            {g.saving > 0
                              ? formatCurrency(g.saving)
                              : g.riAvailable
                                ? "—"
                                : "n/a"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <p className="mt-3 text-xs text-muted-foreground">
                A reservation bills 24×7, so it only pays off above the break-even
                utilisation shown. &quot;Confident&quot; means the group&apos;s
                running fraction clears break-even with margin (running fraction
                defaults to a conservative 85% — Workload Intelligence refines it
                per VM from real metrics). &quot;No RI for this SKU&quot; means
                Azure doesn&apos;t sell a reservation for that series — older
                families like Dsv3 are pay-as-you-go only, so there&apos;s no
                reservation saving to capture. Live reservation rates come from
                the Azure Retail Prices API.
              </p>
            </>
          )}
        </CardContent>
      </Card>
    </>
  );
}

/** Format money with an explicit currency code when Azure reports non-USD. */
function fmtMoney(value: number, currency: string): string {
  const base = formatCurrency(value);
  return currency && currency !== "USD" ? `${base} ${currency}` : base;
}

/** Currency-aware money formatter for Cost Management figures (any currency). */
function fmtCost(value: number, currency: string, dp = 0): string {
  if (!Number.isFinite(value)) return "—";
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currency || "USD",
      minimumFractionDigits: dp,
      maximumFractionDigits: dp,
    }).format(value);
  } catch {
    // Unknown currency code — fall back to a plain number + code.
    return `${value.toFixed(dp)} ${currency}`.trim();
  }
}

function Metric({ k, v }: { k: string; v: string }) {
  return (
    <div>
      <div className="text-[10.5px] uppercase tracking-wider text-muted-foreground">{k}</div>
      <div className="mt-0.5 font-display text-lg tabular-nums">{v}</div>
    </div>
  );
}

/** Minimal inline sparkline: history solid, forecast dashed. Pure SVG. */
function Sparkline({ history, forecast }: { history: number[]; forecast: number[] }) {
  const all = [...history, ...forecast];
  if (all.length < 2) return null;
  const min = Math.min(...all);
  const max = Math.max(...all);
  const range = max - min || 1;
  const W = 640;
  const H = 80;
  const n = all.length;
  const x = (i: number) => (i / (n - 1)) * W;
  const y = (v: number) => H - ((v - min) / range) * (H - 8) - 4;

  const histPath = history.map((v, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const foreStart = history.length - 1;
  const forePath = [history[history.length - 1], ...forecast]
    .map((v, i) => `${i === 0 ? "M" : "L"}${x(foreStart + i).toFixed(1)},${y(v).toFixed(1)}`)
    .join(" ");

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-20 w-full" preserveAspectRatio="none">
      <path d={histPath} fill="none" stroke="hsl(var(--primary))" strokeWidth="2" />
      <path d={forePath} fill="none" stroke="hsl(var(--primary))" strokeWidth="2" strokeDasharray="4 3" opacity="0.6" />
    </svg>
  );
}
