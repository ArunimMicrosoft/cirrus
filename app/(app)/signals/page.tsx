"use client";

import Link from "next/link";
import {
  Activity,
  ArrowRight,
  Boxes,
  Gauge,
  GitCompare,
  Network,
  Route,
  ScrollText,
  Share2,
  ShieldCheck,
  TrendingUp,
} from "lucide-react";
import { PageHeader } from "@/components/data/PageHeader";
import { NoSubscriptionState } from "@/components/data/NoSubscriptionState";
import { AnomaliesPanel } from "@/components/data/AnomaliesPanel";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAnomalies } from "@/lib/hooks/use-anomalies";
import { useSubscriptionStore } from "@/lib/hooks/use-subscription";

/**
 * /signals — dedicated home for the intelligence layer.
 *
 * The three signals are:
 *   1. Anomaly detection — surfaced in full, right here
 *   2. Right-sizing verdict — lives on /cost/right-sizing (linked below)
 *   3. Drift risk — lives on /tools/drift (linked below)
 *
 * The anomaly panel is the reason this page exists — without a dedicated
 * home it would only be visible on the dashboard, and only after a user
 * has visited enough times to have baselines to compare.
 */
export default function SignalsPage() {
  const activeId = useSubscriptionStore((s) => s.activeId);
  const {
    anomalies,
    sessionCount,
    isReady,
    isLoading,
  } = useAnomalies();

  if (!activeId) return <NoSubscriptionState />;

  return (
    <>
      <PageHeader
        icon={<Activity className="h-5 w-5" />}
        title="Intelligence Signals"
        description="Anomaly detection, drift risk, and right-sizing verdicts. All three run locally against data already fetched from your subscription."
      />

      {/* Primary content: the anomaly panel, always visible here. */}
      <section>
        <div className="mb-2 flex items-center gap-2">
          <div className="h-1 w-1 rounded-full bg-primary" />
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Anomaly detection · your rolling 7-day baseline
          </h2>
        </div>
        <AnomaliesPanel
          anomalies={anomalies}
          sessionCount={sessionCount}
          isReady={isReady && !isLoading}
        />
        <p className="mt-3 text-[11.5px] leading-relaxed text-muted-foreground">
          Every dashboard load quietly captures 14 subscription-level counts
          (VMs, orphan disks, risky NSG rules, public storage, App Services
          without HTTPS, and more) into your browser&apos;s IndexedDB. On
          later loads Meridian compares today&apos;s numbers to the median
          of the last week and flags what&apos;s materially out of line.
          Nothing leaves your machine.
        </p>
      </section>

      {/* Intelligence modules — the real algorithm-driven analyses. */}
      <section>
        <div className="mb-2 flex items-center gap-2">
          <div className="h-1 w-1 rounded-full bg-primary" />
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Intelligence modules
          </h2>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <SignalCard
            icon={<TrendingUp className="h-5 w-5" />}
            title="Cost Intelligence"
            summary="Holt-Winters growth forecasting with prediction bands, reservation break-even optimisation, and first-fit-decreasing consolidation packing."
            action="Open cost intelligence"
            href="/intelligence/cost"
          />
          <SignalCard
            icon={<Route className="h-5 w-5" />}
            title="Network Intelligence"
            summary="Formal NSG analysis: shadowed-rule detection via CIDR/port interval algebra, plus Dijkstra shortest attack paths from the Internet to sensitive resources."
            action="Open network intelligence"
            href="/intelligence/network"
          />
          <SignalCard
            icon={<Network className="h-5 w-5" />}
            title="IP Address Management"
            summary="Subnet capacity accounting with usable-vs-allocated IP math, exhaustion forecasting, and CIDR interval-overlap detection across every VNet and subnet."
            action="Open IPAM"
            href="/intelligence/ipam"
          />
          <SignalCard
            icon={<Share2 className="h-5 w-5" />}
            title="Network Topology"
            summary="VNet peering graph with connected-components island detection and transitivity gaps, a subnet reachability matrix, and a zero-trust segmentation score."
            action="Open topology"
            href="/intelligence/topology"
          />
          <SignalCard
            icon={<Boxes className="h-5 w-5" />}
            title="Workload Intelligence"
            summary="k-means workload clustering, distribution-based right-sizing with throttle-risk, and CUSUM changepoint detection on 14 days of CPU."
            action="Open workload intelligence"
            href="/intelligence/workload"
          />
          <SignalCard
            icon={<ScrollText className="h-5 w-5" />}
            title="Governance Intelligence"
            summary="Infers your tenant's implicit naming and tagging conventions by pattern mining, then flags the resources that don't conform."
            action="Open governance intelligence"
            href="/intelligence/governance"
          />
        </div>
      </section>

      {/* Related surfaces where signals also appear. */}
      <section>
        <div className="mb-2 flex items-center gap-2">
          <div className="h-1 w-1 rounded-full bg-primary" />
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Related surfaces
          </h2>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <SignalCard
            icon={<Gauge className="h-5 w-5" />}
            title="Right-sizing verdict"
            summary="Every Azure Advisor recommendation graded high / medium / low confidence against 30 days of live CPU metrics. Only trusted savings roll up in your total."
            action="Open right-sizing"
            href="/cost/right-sizing"
          />
          <SignalCard
            icon={<GitCompare className="h-5 w-5" />}
            title="Drift risk"
            summary="Every change between two snapshots classified RISKY / NOTABLE / benign in real time. Risky items float to the top. A 200-line diff becomes a 3-line decision."
            action="Open drift detector"
            href="/tools/drift"
          />
        </div>
      </section>

      {/* Trust note. */}
      <Alert variant="success">
        <ShieldCheck className="h-4 w-4" />
        <AlertTitle>All three signals stay read-only</AlertTitle>
        <AlertDescription>
          Every classifier runs in your browser on data Meridian already
          fetched. No LLM API call, no external inference, no shared
          training data. Baselines live in your device&apos;s IndexedDB —
          clearing site data resets them.
        </AlertDescription>
      </Alert>
    </>
  );
}

function SignalCard({
  icon,
  title,
  summary,
  action,
  href,
}: {
  icon: React.ReactNode;
  title: string;
  summary: string;
  action: string;
  href: string;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm font-semibold">
          <span className="flex h-8 w-8 items-center justify-center rounded-md border border-primary/40 bg-primary/10 text-primary">
            {icon}
          </span>
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col justify-between gap-4 pb-4">
        <p className="text-[13.5px] leading-relaxed text-muted-foreground">
          {summary}
        </p>
        <Link
          href={href}
          className="inline-flex w-fit items-center gap-1.5 rounded-md border border-primary/40 bg-primary/10 px-3 py-1.5 text-[13px] font-semibold text-primary transition-colors hover:bg-primary/20"
        >
          {action}
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </CardContent>
    </Card>
  );
}
