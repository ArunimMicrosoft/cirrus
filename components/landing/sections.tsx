"use client";

/**
 * Landing surface components — shared across the marketing routes
 * (/, /features, /security, /family).
 *
 * The pages themselves only compose sections from this file, which
 * keeps route files short and lets the same Hero/Footer/etc appear on
 * every page without duplication.
 */

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ArrowRight,
  ArrowUpRight,
  Boxes,
  CheckCircle2,
  ExternalLink,
  FileJson,
  Lock,
  Map as MapIcon,
  Radio,
  Route as RouteIcon,
  ShieldCheck,
  TrendingUp,
} from "lucide-react";
import { LoginForm } from "@/components/auth/LoginForm";
import { ThemeToggle } from "@/components/layout/ThemeToggle";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { BRAND } from "@/lib/brand";
import { FAMILY_PRODUCTS, type FamilyProduct } from "@/lib/products";
import { ALGORITHMS } from "@/lib/algorithms";
import { Reveal, CountUp } from "@/components/landing/motion";
import { ReachabilityGraphPanel } from "@/components/landing/ReachabilityShowcase";
import { DemoButton } from "@/components/auth/DemoButton";

/* -----------------------------------------------------------
 * Nav — appears on every marketing page
 * -----------------------------------------------------------*/

interface NavLink {
  href: string;
  label: string;
}

const NAV_LINKS: NavLink[] = [
  { href: "/features", label: "Features" },
  { href: "/security", label: "Security" },
  { href: "/handbook", label: "Handbook" },
  { href: "/family", label: "Family" },
];

export function TopNav() {
  const pathname = usePathname();
  return (
    <header className="sticky top-0 z-40 border-b border-border/60 bg-background/85 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 px-5 md:px-8">
        <Link href="/" className="group flex items-baseline gap-2">
          <span className="font-display text-[19px] leading-none tracking-tight">
            {BRAND.name}
          </span>
          <span className="hidden text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground transition-colors group-hover:text-foreground md:inline">
            {BRAND.descriptor}
          </span>
        </Link>
        <nav className="hidden items-center gap-6 text-[13px] text-muted-foreground md:flex">
          {NAV_LINKS.map((l) => {
            const active = pathname === l.href;
            return (
              <Link
                key={l.href}
                href={l.href}
                className={cn(
                  "hover:text-foreground",
                  active && "text-foreground",
                )}
              >
                {l.label}
              </Link>
            );
          })}
        </nav>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <Button asChild size="sm">
            <Link href="/#sign-in">
              Sign in <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </Button>
        </div>
      </div>
    </header>
  );
}

/* -----------------------------------------------------------
 * Hero — the marketing landing hero
 * -----------------------------------------------------------*/

export function Hero() {
  return (
    <section className="relative overflow-hidden border-b border-border/60">
      <div className="cc-glow pointer-events-none absolute inset-0 opacity-100" aria-hidden />
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-background" aria-hidden />

      <div className="relative mx-auto max-w-6xl px-5 py-16 md:px-8 md:py-24 lg:py-28">
        {/* Live status bar at the top of the hero — sets the "command center" tone. */}
        <div className="mb-10 flex flex-wrap items-center gap-x-6 gap-y-2 text-[11.5px] uppercase tracking-[0.14em] text-muted-foreground md:mb-14">
          <span className="inline-flex items-center gap-2 font-medium">
            <LiveDot />
            System · Nominal
          </span>
          <span className="hidden md:inline text-muted-foreground/40">|</span>
          <span className="hidden md:inline">Reader-role only</span>
          <span className="hidden md:inline text-muted-foreground/40">|</span>
          <span className="hidden md:inline">Multi-tenant · Lighthouse-aware</span>
          <span className="ml-auto hidden normal-case text-muted-foreground/70 md:inline">
            Set up in under a minute
          </span>
        </div>

        {/* Headline + subtitle */}
        <div className="max-w-3xl">
          <h1 className="font-display text-[44px] leading-[1.02] tracking-tight md:text-[76px]">
            Understand your Azure estate{" "}
            <span className="bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent">
              in minutes.
            </span>
          </h1>
          <p className="mt-5 font-display text-[20px] font-medium tracking-tight text-foreground/90 md:text-[26px]">
            Map it. Trace it. Audit it. Forecast it.
          </p>
          <p className="mt-5 max-w-2xl text-[15.5px] leading-relaxed text-muted-foreground md:text-[17px]">
            {BRAND.name} gives Azure teams a live, read-only view of their
            infrastructure, network paths, security posture, and cost trends —
            turned into a plain-English action list, not another raw dashboard.
          </p>
          <div className="mt-5 flex flex-wrap items-center gap-x-3 gap-y-2 text-[13px] font-medium text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <LiveDot />
              No black-box AI
            </span>
            <span className="text-muted-foreground/40">·</span>
            <span>No infrastructure changes</span>
            <span className="text-muted-foreground/40">·</span>
            <span>Reader access is all it needs</span>
          </div>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Button asChild size="lg" className="h-11 px-5 text-[14px]">
              <Link href="/#sign-in">
                Open the console
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
            <Link
              href="/features"
              className="inline-flex items-center gap-1.5 rounded-md border px-4 py-2.5 text-[13.5px] font-medium hover:bg-muted/40"
            >
              See the platform
              <ArrowUpRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>

        {/* Hero visual — the live-style reachability animation on a clearly
            labelled sample estate (no fabricated "live" data). */}
        <div className="mt-16 md:mt-20">
          <ReachabilityGraphPanel />
        </div>
      </div>
    </section>
  );
}

function LiveDot() {
  return (
    <span
      aria-hidden
      className="relative inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-success text-success live-dot"
    />
  );
}

/**
 * A shorter reusable page header for sub-routes. Just eyebrow + title +
 * subtitle, no CTAs or mocks. Keeps the sub-pages breathing.
 */
export function PageHero({
  eyebrow,
  title,
  subtitle,
}: {
  eyebrow: string;
  title: string;
  subtitle: string;
}) {
  return (
    <section className="relative overflow-hidden border-b border-border/60">
      <div className="cc-glow pointer-events-none absolute inset-0 opacity-30" aria-hidden />
      <div className="relative mx-auto max-w-6xl px-5 py-16 md:px-8 md:py-24">
        <div className="mb-6 flex flex-wrap items-center gap-x-6 gap-y-1 font-mono text-[10.5px] uppercase tracking-[0.14em] text-muted-foreground">
          <span className="inline-flex items-center gap-2 text-primary">
            <LiveDot />
            {eyebrow}
          </span>
        </div>
        <div className="max-w-3xl">
          <h1 className="font-display text-[36px] leading-[1.02] tracking-tight md:text-[56px]">
            {title}
          </h1>
          <p className="mt-5 max-w-2xl text-[15.5px] leading-relaxed text-muted-foreground md:text-[17px]">
            {subtitle}
          </p>
        </div>
      </div>
    </section>
  );
}



/* -----------------------------------------------------------
 * Signals strip — compact preview for the landing
 * -----------------------------------------------------------*/

/* -----------------------------------------------------------
 * Family strip — compact preview of the product family for the landing
 * -----------------------------------------------------------*/

export function FamilyStrip() {
  return (
    <section className="relative border-b border-border/60 bg-muted/10">
      <div className="mx-auto max-w-6xl px-5 py-16 md:px-8 md:py-20">
        <div className="mb-8 flex flex-wrap items-baseline justify-between gap-6">
          <div>
            <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-primary">
              <LiveDot />
              Family
            </div>
            <h2 className="mt-3 font-display text-[26px] leading-tight tracking-tight md:text-[34px]">
              Sibling tools from Arunim's IT Caffe
            </h2>
          </div>
          <Link
            href="/family"
            className="inline-flex shrink-0 items-center gap-1.5 rounded-md border bg-card/60 px-3 py-2 text-[12.5px] font-medium hover:bg-muted/40"
          >
            See all
            <ArrowUpRight className="h-3.5 w-3.5" />
          </Link>
        </div>
        <div className="grid gap-3 md:grid-cols-3">
          {FAMILY_PRODUCTS.map((p) => {
            const isCurrent = p.status === "current";
            const isLive = p.status === "live";
            const inner = (
              <div className="cc-panel flex h-full flex-col justify-between gap-4 rounded-xl p-5">
                <div>
                  <div className="flex items-baseline gap-2">
                    <span className="font-display text-[20px] leading-none tracking-tight">
                      {p.name}
                    </span>
                    {isCurrent && (
                      <span className="inline-flex items-center gap-1 rounded-full border border-primary/40 bg-primary/10 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-primary">
                        <LiveDot />
                        Active
                      </span>
                    )}
                  </div>
                  <div className="mt-2 font-mono text-[10.5px] uppercase tracking-[0.13em] text-muted-foreground">
                    {p.tagline}
                  </div>
                  <p className="mt-3 text-[13px] leading-relaxed text-muted-foreground">
                    {p.description}
                  </p>
                </div>
                {isLive && p.domain && (
                  <div className="inline-flex w-fit items-center gap-1.5 rounded-md border border-primary/40 bg-primary/10 px-2.5 py-1.5 font-mono text-[11.5px] font-medium text-primary transition-colors group-hover:bg-primary/20">
                    {p.domain}
                    <ExternalLink className="h-3 w-3" />
                  </div>
                )}
              </div>
            );
            if (isLive && p.url) {
              return (
                <a
                  key={p.name}
                  href={p.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group block transition-transform hover:-translate-y-0.5"
                >
                  {inner}
                </a>
              );
            }
            return <div key={p.name}>{inner}</div>;
          })}
        </div>
      </div>
    </section>
  );
}

/* -----------------------------------------------------------
 * Pillars — the four-move workflow (expands the hero punch line)
 * -----------------------------------------------------------*/

export function Pillars() {
  const pillars = [
    {
      icon: <MapIcon className="h-5 w-5" />,
      verb: "Map",
      title: "See the whole estate at once",
      body: "Every subscription, resource, VNet and subnet in one live view — and how they connect. Sprawl you couldn't hold in your head becomes a picture you can read in seconds.",
    },
    {
      icon: <RouteIcon className="h-5 w-5" />,
      verb: "Trace",
      title: "Follow any path, hop by hop",
      body: "Pick a VM and watch traffic travel from the internet edge to the workload — every firewall, subnet and peering in between. \u201cCan this be reached?\u201d becomes a click, not a ticket.",
    },
    {
      icon: <ShieldCheck className="h-5 w-5" />,
      verb: "Audit",
      title: "Know exactly where you stand",
      body: "Score the estate against the Well-Architected Framework, check CIS controls, and surface the shortest attack path from the internet to sensitive data — before anyone else finds it.",
    },
    {
      icon: <TrendingUp className="h-5 w-5" />,
      verb: "Forecast",
      title: "See the bill and the risk coming",
      body: "Project spend, verify every saving against real usage, and catch anomalies against your own baseline. Get ahead of the surprise instead of cleaning it up.",
    },
  ];
  return (
    <section className="relative border-b border-border/60">
      <div className="mx-auto max-w-6xl px-5 py-20 md:px-8 md:py-24">
        <div className="mb-12 max-w-2xl">
          <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-primary">
            <LiveDot />
            The workflow
          </div>
          <h2 className="mt-3 font-display text-[32px] leading-tight tracking-tight md:text-[46px]">
            Four moves. One read-only console.
          </h2>
          <p className="mt-4 text-[14.5px] leading-relaxed text-muted-foreground">
            The Azure portal scatters the answers across a hundred blades.{" "}
            {BRAND.name} pulls them into a single workflow, so your team spends
            its time deciding — not digging.
          </p>
        </div>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {pillars.map((p, i) => (
            <Reveal key={p.verb} delay={i * 110}>
              <div className="cc-panel flex h-full flex-col gap-3 rounded-xl p-5">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  {p.icon}
                </div>
                <div className="font-display text-[12px] font-semibold uppercase tracking-[0.14em] text-primary">
                  {p.verb}
                </div>
                <div className="font-display text-[19px] leading-tight tracking-tight">
                  {p.title}
                </div>
                <p className="text-[13px] leading-relaxed text-muted-foreground">
                  {p.body}
                </p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

export function SignalsStrip() {
  const items: Array<{
    tag: string;
    title: string;
    metric: string;
    body: string;
  }> = [
    {
      tag: "01 · Right-sizing",
      title: "Trust the number, not just the tip",
      metric: "$103k / yr",
      body: "Every Azure Advisor recommendation graded against 30 days of live CPU metrics. Low-confidence claims are excluded from the trusted-savings total.",
    },
    {
      tag: "02 · Drift risk",
      title: "Two-line reviews, not 200-line diffs",
      metric: "3 risky",
      body: "Every change scored RISKY / NOTABLE / benign in real time. Risky items float to the top. Weekly drift review shrinks from twenty minutes to two.",
    },
    {
      tag: "03 · Anomalies",
      title: "Catch the leak the day it starts",
      metric: "+12 IPs",
      body: "Daily rollups compared to your own rolling 7-day baseline. History lives in your browser only. No shared training data, no vendor lock-in.",
    },
  ];
  return (
    <section className="relative border-b border-border/60 bg-muted/20">
      <div className="mx-auto max-w-6xl px-5 py-20 md:px-8 md:py-24">
        <div className="mb-12 flex flex-wrap items-baseline justify-between gap-6">
          <div>
            <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-primary">
              <LiveDot />
              Intelligence layer
            </div>
            <h2 className="mt-3 font-display text-[32px] leading-tight tracking-tight md:text-[42px]">
              Three signals that turn inventory
              <br className="hidden md:inline" /> into an action list.
            </h2>
          </div>
          <Link
            href="/features"
            className="inline-flex shrink-0 items-center gap-1.5 rounded-md border bg-card/60 px-3 py-2 text-[12.5px] font-medium hover:bg-muted/40"
          >
            Full toolkit
            <ArrowUpRight className="h-3.5 w-3.5" />
          </Link>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          {items.map((s, i) => (
            <Reveal key={s.title} delay={i * 120} className="h-full">
            <div
              className="cc-panel group relative flex h-full flex-col gap-4 rounded-xl p-5 transition-colors hover:bg-card/80"
            >
              <div className="text-[10.5px] font-mono uppercase tracking-[0.13em] text-muted-foreground">
                {s.tag}
              </div>
              <div className="font-display text-[24px] leading-tight tracking-tight">
                {s.title}
              </div>
              <div className="flex items-baseline gap-2 border-y py-3">
                <span className="font-display text-[26px] leading-none tracking-tight tabular-nums text-primary">
                  {s.metric}
                </span>
                <span className="text-[10.5px] uppercase tracking-wider text-muted-foreground">
                  sample
                </span>
              </div>
              <p className="text-[13px] leading-relaxed text-muted-foreground">
                {s.body}
              </p>
            </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

/* -----------------------------------------------------------
 * Metrics row (used on landing + features)
 * -----------------------------------------------------------*/

export function MetricsRow() {
  const metrics: Array<{
    count?: number;
    prefix?: string;
    suffix?: string;
    text?: string;
    label: string;
    tone?: "success" | "primary";
  }> = [
    { count: 22, label: "Views wired end-to-end", tone: "primary" },
    { count: 0, label: "Write operations · ever", tone: "success" },
    { text: "Reader", label: "Only Azure role needed" },
    { count: 5, prefix: "~", suffix: " min", label: "Time from signup to signal" },
  ];
  return (
    <section className="relative border-b border-border/60 bg-muted/10">
      <div className="mx-auto grid max-w-6xl grid-cols-2 gap-4 px-5 py-8 md:grid-cols-4 md:px-8 md:py-10">
        {metrics.map((m, i) => (
          <Reveal key={m.label} delay={i * 90}>
            <div className="cc-panel flex h-full flex-col rounded-lg px-4 py-3">
              <span
                className={cn(
                  "font-display text-[28px] leading-none tracking-tight tabular-nums md:text-[34px]",
                  m.tone === "primary" && "text-primary",
                  m.tone === "success" && "text-success",
                )}
              >
                {m.text !== undefined ? (
                  m.text
                ) : (
                  <CountUp value={m.count ?? 0} prefix={m.prefix} suffix={m.suffix} />
                )}
              </span>
              <span className="mt-2 font-mono text-[10.5px] uppercase tracking-[0.13em] text-muted-foreground">
                {m.label}
              </span>
            </div>
          </Reveal>
        ))}
      </div>
    </section>
  );
}

/* -----------------------------------------------------------
 * Product story — flagship moments with mocks
 * -----------------------------------------------------------*/

export function ProductStory() {
  return (
    <section id="product" className="border-b border-border/60">
      <div className="mx-auto max-w-6xl px-5 py-24 md:px-8">
        <SectionHead
          eyebrow="Flagship features"
          title="How operators use Meridian every day"
          subtitle="Four flagship tools with real screens — network tracing, WAF review, CIS audit, live pricing."
        />
        <div className="mt-14 space-y-24">
          <Moment number="01" eyebrow="Network path" title="Trace traffic hop-by-hop from source to VM"
            body="Pick any VM and Meridian walks the network chain — NIC, subnet, NSG, effective rules, route table, public IP — reproducing the same source-to-destination trace az network watcher gives you. Then the traffic simulator evaluates a given (source, port) against every rule in priority order and shows exactly which one matched."
            mock={<TrafficMock />} />
          <Moment number="02" eyebrow="Well-Architected" title="Score your estate against Microsoft's five pillars"
            body="Cost, Reliability, Security, Operational Excellence, Performance Efficiency. Every VM, storage account, key vault, and public IP is scored against the WAF checklist with letter grades and an overall roll-up. Findings link back to the exact resource — no leaving the report to drill in."
            mock={<WafMock />} reverse />
          <Moment number="03" eyebrow="CIS Benchmark" title="Twelve CIS controls, run on every load"
            body="RDP, SSH, and database ports open to the Internet. Storage accounts allowing HTTP or public blobs. Key Vaults without purge protection. App Services that don't enforce HTTPS. All flagged with the CIS control ID they violate, ready to export as an audit PDF."
            mock={<RiskMock />} />
          <Moment number="04" eyebrow="Live spend" title="Real prices from the Azure Retail Prices API"
            body="Every VM cost is pulled from Microsoft's public Retail Prices API for the exact SKU and region. PAYG, 1-year RI, and 3-year RI rates arrive in the same round trip."
            mock={<SpendMock />} reverse />
        </div>
      </div>
    </section>
  );
}

function Moment({
  number, eyebrow, title, body, mock, reverse,
}: {
  number: string; eyebrow: string; title: string; body: string;
  mock: React.ReactNode; reverse?: boolean;
}) {
  return (
    <div className={cn(
      "grid items-center gap-10 md:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] md:gap-16",
      reverse && "md:[&>*:first-child]:order-2",
    )}>
      <div>
        <div className="mb-3 flex items-baseline gap-3">
          <span className="font-display text-4xl leading-none tracking-tight text-muted-foreground/60">{number}</span>
          <span className="text-[11.5px] font-semibold uppercase tracking-[0.13em] text-primary">{eyebrow}</span>
        </div>
        <h3 className="font-display text-[30px] leading-[1.05] tracking-tight md:text-[36px]">{title}</h3>
        <p className="mt-4 max-w-md text-[14.5px] leading-relaxed text-muted-foreground">{body}</p>
      </div>
      {mock}
    </div>
  );
}

function SpendMock() {
  const rows = [
    { sku: "Standard_D4s_v5", region: "eastus", payg: 192, ri3y: 77 },
    { sku: "Standard_D8s_v5", region: "westeu", payg: 384, ri3y: 154 },
    { sku: "Standard_B2ms", region: "eastus", payg: 61, ri3y: 25 },
    { sku: "Standard_E4s_v5", region: "eastus", payg: 252, ri3y: 101 },
  ];
  return (
    <div className="cc-panel rounded-xl p-5">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-[12px] font-semibold">RI vs PAYG · Live</span>
        <span className="inline-flex items-center gap-1 rounded-md bg-emerald-500/12 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700 dark:text-emerald-400">
          <Radio className="h-2.5 w-2.5" /> Retail Prices API
        </span>
      </div>
      <div className="overflow-hidden rounded-md border">
        <table className="w-full text-[11.5px]">
          <thead className="bg-muted/50 text-[9.5px] uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-2.5 py-1.5 text-left font-semibold">SKU</th>
              <th className="px-2.5 py-1.5 text-right font-semibold">PAYG</th>
              <th className="px-2.5 py-1.5 text-right font-semibold">3-Yr RI</th>
              <th className="px-2.5 py-1.5 text-right font-semibold">Save</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const save = ((r.payg - r.ri3y) / r.payg) * 100;
              return (
                <tr key={r.sku} className="border-t">
                  <td className="px-2.5 py-1.5 font-mono text-[10.5px]">{r.sku}</td>
                  <td className="px-2.5 py-1.5 text-right tabular-nums">${r.payg}</td>
                  <td className="px-2.5 py-1.5 text-right tabular-nums">${r.ri3y}</td>
                  <td className="px-2.5 py-1.5 text-right font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">
                    −{save.toFixed(0)}%
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function RiskMock() {
  const checks: Array<[string, string, "pass" | "fail" | "review"]> = [
    ["6.1", "RDP restricted from Internet", "pass"],
    ["6.2", "SSH restricted from Internet", "fail"],
    ["3.1", "Storage HTTPS-only", "pass"],
    ["3.7", "Public blob access blocked", "pass"],
    ["9.2", "App Service HTTPS-only", "fail"],
    ["8.2", "Key Vault purge protection", "review"],
  ];
  return (
    <div className="cc-panel rounded-xl p-5">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-[12px] font-semibold">CIS Benchmark</span>
        <span className="rounded-md bg-amber-500/12 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700 dark:text-amber-400">
          67% compliant
        </span>
      </div>
      <div className="space-y-1.5">
        {checks.map(([id, label, status]) => (
          <div key={id} className="flex items-center gap-2 rounded-md border bg-background/60 px-2.5 py-1.5 text-[11.5px]">
            <span className="font-mono text-[10px] font-semibold text-muted-foreground">{id}</span>
            <span className="flex-1">{label}</span>
            {status === "pass" && <span className="rounded bg-emerald-500/12 px-1.5 py-0.5 text-[9.5px] font-semibold text-emerald-700 dark:text-emerald-400">PASS</span>}
            {status === "fail" && <span className="rounded bg-rose-500/12 px-1.5 py-0.5 text-[9.5px] font-semibold text-rose-700 dark:text-rose-400">FAIL</span>}
            {status === "review" && <span className="rounded bg-amber-500/12 px-1.5 py-0.5 text-[9.5px] font-semibold text-amber-700 dark:text-amber-400">REVIEW</span>}
          </div>
        ))}
      </div>
    </div>
  );
}

function TrafficMock() {
  const trace = [
    { prio: 100, name: "AllowVnetHttps", result: "skip" },
    { prio: 200, name: "AllowSshFromVnet", result: "skip" },
    { prio: 65500, name: "DenyAllInbound", result: "match" },
  ];
  return (
    <div className="cc-panel rounded-xl p-5">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-[12px] font-semibold">Traffic simulator</span>
        <span className="rounded-md bg-rose-500/12 px-1.5 py-0.5 text-[10px] font-semibold text-rose-700 dark:text-rose-400">DENY</span>
      </div>
      <div className="mb-3 space-y-1 text-[11.5px]">
        <SimField k="Source" v="0.0.0.0/0" />
        <SimField k="Port" v="22 (SSH)" />
        <SimField k="Protocol" v="TCP" />
      </div>
      <div className="rounded-md border bg-muted/30 p-2 font-mono text-[10.5px]">
        {trace.map((t) => (
          <div key={t.prio} className={cn("flex justify-between", t.result === "match" && "text-rose-600 dark:text-rose-400")}>
            <span><span className="text-muted-foreground">{t.prio}</span> · {t.name}</span>
            <span>{t.result}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function SimField({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between rounded-md border bg-background/60 px-2.5 py-1">
      <span className="text-[9.5px] font-semibold uppercase tracking-wider text-muted-foreground">{k}</span>
      <span className="font-mono text-[11px]">{v}</span>
    </div>
  );
}

function WafMock() {
  const pillars: Array<[string, number, string]> = [
    ["Cost", 88, "A"], ["Reliability", 62, "C"], ["Security", 45, "F"],
    ["Ops. Excellence", 74, "B"], ["Performance", 91, "A"],
  ];
  const overall = Math.round(pillars.reduce((s, [, v]) => s + v, 0) / pillars.length);
  return (
    <div className="cc-panel rounded-xl p-5">
      <div className="mb-4 flex items-center justify-between">
        <span className="text-[12px] font-semibold">Well-Architected Review</span>
        <span className="inline-flex items-center gap-1 rounded-md bg-amber-500/12 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700 dark:text-amber-400">
          Overall {overall} · B
        </span>
      </div>
      <div className="space-y-2.5">
        {pillars.map(([name, score, grade]) => {
          const bar = score >= 80 ? "bg-emerald-500" : score >= 60 ? "bg-amber-500" : "bg-rose-500";
          const chip = score >= 80 ? "bg-emerald-500/12 text-emerald-700 dark:text-emerald-400"
            : score >= 60 ? "bg-amber-500/12 text-amber-700 dark:text-amber-400"
            : "bg-rose-500/12 text-rose-700 dark:text-rose-400";
          return (
            <div key={name} className="flex items-center gap-2.5 text-[11.5px]">
              <span className="w-[96px] shrink-0 truncate text-muted-foreground">{name}</span>
              <div className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                <div className={cn("absolute inset-y-0 left-0 rounded-full", bar)} style={{ width: `${score}%` }} />
              </div>
              <span className="w-6 shrink-0 text-right tabular-nums text-muted-foreground">{score}</span>
              <span className={cn("w-5 shrink-0 rounded px-1 py-0.5 text-center text-[9.5px] font-semibold", chip)}>{grade}</span>
            </div>
          );
        })}
      </div>
      <div className="mt-4 flex items-center justify-between border-t pt-3 text-[10.5px] text-muted-foreground">
        <span>5 pillars · 47 checks</span>
        <span className="font-mono">3 findings · Security</span>
      </div>
    </div>
  );
}

/* -----------------------------------------------------------
 * Toolkit
 * -----------------------------------------------------------*/

export function Toolkit() {
  const categories: Array<{
    id: string;
    label: string;
    tagline: string;
    features: string[];
    metric: string;
    metricLabel: string;
  }> = [
    {
      id: "net",
      label: "Network analysis",
      tagline: "Trace, simulate, and map every flow.",
      features: ["Hop-by-hop path", "Traffic simulator", "Effective rules", "Blast Radius", "Route tables"],
      metric: "22",
      metricLabel: "hops traced per VM",
    },
    {
      id: "sec",
      label: "Security & compliance",
      tagline: "WAF, CIS, and NSG posture at a glance.",
      features: ["WAF 5-pillar review", "CIS Benchmark · 12 controls", "Key Vault audit", "Public exposure map"],
      metric: "12",
      metricLabel: "CIS controls · every load",
    },
    {
      id: "cost",
      label: "Cost intelligence",
      tagline: "Live prices, not fallback estimates.",
      features: ["Retail Prices API", "PAYG · 1-Yr · 3-Yr RI", "Right-sizing verdict", "Orphan waste $", "Tag attribution"],
      metric: "$103k",
      metricLabel: "typical trusted savings / yr",
    },
    {
      id: "drift",
      label: "Change detection",
      tagline: "Two-line reviews, not 200-line diffs.",
      features: ["Full-tenant snapshots", "Risk classifier", "Baseline anomalies", "Browser-local history"],
      metric: "60d",
      metricLabel: "rolling baseline window",
    },
    {
      id: "query",
      label: "Custom queries",
      tagline: "Your own KQL, run cross-subscription.",
      features: ["Resource Graph Explorer", "12 starter templates", "CSV + PDF export", "Read-only Kusto"],
      metric: "Kusto",
      metricLabel: "query-only by design",
    },
    {
      id: "monitor",
      label: "Monitoring",
      tagline: "CPU, memory, alerts — in one shell.",
      features: ["Live Monitor metrics", "Activity log · 1h / 7d / 30d", "VM backup posture", "Alert digest"],
      metric: "3",
      metricLabel: "monitoring views",
    },
  ];
  return (
    <section id="toolkit" className="relative border-b border-border/60">
      <div className="mx-auto max-w-6xl px-5 py-20 md:px-8 md:py-24">
        <div className="mb-12 max-w-3xl">
          <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-primary">
            <LiveDot />
            The toolkit
          </div>
          <h2 className="mt-3 font-display text-[32px] leading-tight tracking-tight md:text-[46px]">
            Six modules. One console.
          </h2>
          <p className="mt-4 text-[14.5px] leading-relaxed text-muted-foreground">
            Every question a cloud operator asks — network, security, cost,
            change, monitoring, custom — answered under one shell. All
            read-only. Reader on Azure is all it needs.
          </p>
        </div>
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {categories.map((c) => (
            <div
              key={c.id}
              className="cc-panel group flex flex-col justify-between gap-4 rounded-xl p-5 transition-colors hover:bg-card/80"
            >
              <div>
                <div className="font-mono text-[10.5px] uppercase tracking-[0.13em] text-muted-foreground">
                  {c.id.padStart(3, "0")}
                </div>
                <div className="mt-1 font-display text-[20px] leading-tight tracking-tight">
                  {c.label}
                </div>
                <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">
                  {c.tagline}
                </p>
              </div>
              <div className="border-y py-3">
                <div className="font-display text-[24px] leading-none tracking-tight tabular-nums text-primary">
                  {c.metric}
                </div>
                <div className="mt-1 text-[10.5px] uppercase tracking-[0.13em] text-muted-foreground">
                  {c.metricLabel}
                </div>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {c.features.map((f) => (
                  <span
                    key={f}
                    className="rounded border bg-background/40 px-2 py-0.5 font-mono text-[10.5px] text-muted-foreground"
                  >
                    {f}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* -----------------------------------------------------------
 * Intelligence — the three signals
 * -----------------------------------------------------------*/

export function Intelligence() {
  const signals: Array<{
    id: string;
    label: string;
    method: string;
    inputs: string[];
    outputs: string[];
    where: string;
    body: React.ReactNode;
  }> = [
    {
      id: "01",
      label: "Right-sizing verdict",
      method: "30-day CPU metrics + tuned thresholds",
      inputs: ["Advisor recommendations", "Azure Monitor metrics", "Live PAYG prices"],
      outputs: ["HIGH · MEDIUM · LOW", "Trusted savings $/yr", "Struck-through overrides"],
      where: "Runs in your browser",
      body: (
        <>
          Azure Advisor tells you <em>&quot;downsize this VM.&quot;</em> Meridian
          fetches the last 30 days of CPU metrics for every VM Advisor flags
          and grades each recommendation. Only high and medium confidence
          rolls up in trusted savings. Low-confidence claims are struck
          through — visible proof that Meridian disagreed with Advisor.
        </>
      ),
    },
    {
      id: "02",
      label: "Drift risk",
      method: "Rule-based classifier · 40+ patterns",
      inputs: ["Two snapshots", "Resource type", "Property delta"],
      outputs: ["RISKY · NOTABLE · benign", "Change reason", "Sorted diff"],
      where: "Runs in your browser",
      body: (
        <>
          Every drift diff carries a risk verdict — <strong>RISKY</strong>{" "}
          (someone opened SSH to the Internet, storage went public),{" "}
          <strong>NOTABLE</strong> (a VM was resized), or{" "}
          <strong>benign</strong> (tags changed). Risky items float to the
          top of the diff table.
        </>
      ),
    },
    {
      id: "03",
      label: "Anomaly detection",
      method: "Median vs current · 7-day window",
      inputs: ["Daily rollup · 14 metrics", "Rolling baseline", "Threshold table"],
      outputs: ["HIGH · MEDIUM · LOW severity", "Delta from baseline", "Per-metric flag"],
      where: "Baseline lives in IndexedDB",
      body: (
        <>
          Meridian captures a daily rollup of your subscription — VM count,
          orphan waste, risky NSG rules, and eleven other metrics — into
          your browser. On subsequent loads it compares today&apos;s numbers
          to the median of the last week and flags what&apos;s out of line.
          No external service, no shared training data.
        </>
      ),
    },
  ];
  return (
    <section id="signals" className="relative border-b border-border/60 bg-muted/20">
      <div className="cc-glow pointer-events-none absolute inset-0 opacity-30" aria-hidden />
      <div className="relative mx-auto max-w-6xl px-5 py-20 md:px-8 md:py-24">
        <div className="mb-12 max-w-3xl">
          <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-primary">
            <LiveDot />
            The intelligence layer
          </div>
          <h2 className="mt-3 font-display text-[32px] leading-tight tracking-tight md:text-[46px]">
            Three signals. Zero external inference.
          </h2>
          <p className="mt-4 text-[14.5px] leading-relaxed text-muted-foreground">
            Every classifier runs locally on data Meridian already fetched.
            No LLM API call, no vendor pipeline, no shared training data.
            The intelligence lives on the same machine as your session.
          </p>
        </div>
        <div className="grid gap-3 md:grid-cols-3">
          {signals.map((s) => (
            <div key={s.id} className="cc-panel flex flex-col gap-4 rounded-xl p-5">
              <div>
                <div className="flex items-center gap-2 font-mono text-[10.5px] uppercase tracking-[0.13em] text-muted-foreground">
                  <span>{s.id}</span>
                  <span className="h-px flex-1 bg-border" />
                  <span className="inline-flex items-center gap-1 text-primary">
                    <LiveDot />
                    Local
                  </span>
                </div>
                <div className="mt-2 font-display text-[22px] leading-tight tracking-tight">
                  {s.label}
                </div>
                <div className="mt-1 font-mono text-[10.5px] text-muted-foreground">
                  {s.method}
                </div>
              </div>
              <p className="text-[12.5px] leading-relaxed text-muted-foreground">
                {s.body}
              </p>
              <div className="grid grid-cols-2 gap-3 border-t pt-3 text-[10.5px]">
                <div>
                  <div className="mb-1 font-semibold uppercase tracking-[0.13em] text-muted-foreground">
                    Inputs
                  </div>
                  <ul className="space-y-0.5 text-muted-foreground">
                    {s.inputs.map((i) => (
                      <li key={i}>{i}</li>
                    ))}
                  </ul>
                </div>
                <div>
                  <div className="mb-1 font-semibold uppercase tracking-[0.13em] text-muted-foreground">
                    Outputs
                  </div>
                  <ul className="space-y-0.5 text-muted-foreground">
                    {s.outputs.map((o) => (
                      <li key={o}>{o}</li>
                    ))}
                  </ul>
                </div>
              </div>
              <div className="border-t pt-3 font-mono text-[10.5px] text-muted-foreground">
                <span className="uppercase tracking-[0.13em]">Where </span>
                <span className="text-foreground">{s.where}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* -----------------------------------------------------------
 * File mode — analyze from ARM/Terraform without a tenant
 * -----------------------------------------------------------*/

export function FileModeSection() {
  const points = [
    {
      icon: <Lock className="h-5 w-5" />,
      title: "Nothing leaves your browser",
      body: "The file is parsed locally, client-side. No upload, no server, no credentials — a safe way to evaluate Meridian before granting any access.",
    },
    {
      icon: <FileJson className="h-5 w-5" />,
      title: "ARM & Terraform",
      body: "Drop an exported ARM template, an az resource list export, or a Terraform state file (.tfstate / terraform show -json).",
    },
    {
      icon: <Boxes className="h-5 w-5" />,
      title: "The same intelligence",
      body: "Network topology, subnet reachability, segmentation score, NSG/WAF review, IPAM and inventory — computed straight from your file.",
    },
  ];
  return (
    <section className="relative border-b border-border/60 bg-muted/10">
      <div className="mx-auto max-w-6xl px-5 py-20 md:px-8 md:py-24">
        <Reveal>
          <div className="max-w-2xl">
            <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-emerald-600 dark:text-emerald-400">
              <ShieldCheck className="h-3.5 w-3.5" />
              No tenant access required
            </div>
            <h2 className="mt-3 font-display text-[32px] leading-tight tracking-tight md:text-[44px]">
              Not ready to connect? Analyze from a file.
            </h2>
            <p className="mt-4 text-[14.5px] leading-relaxed text-muted-foreground">
              Some teams can&apos;t hand out even read-only access on day one. Upload an
              exported ARM template or a Terraform state file and Meridian maps your
              network paths, reachability and security posture — parsed entirely in your
              browser.
            </p>
          </div>
        </Reveal>

        <div className="mt-10 grid gap-4 md:grid-cols-3">
          {points.map((p, i) => (
            <Reveal key={p.title} delay={i * 110}>
              <div className="cc-panel flex h-full flex-col gap-3 rounded-xl p-5">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                  {p.icon}
                </div>
                <div className="font-display text-[17px] leading-tight tracking-tight">
                  {p.title}
                </div>
                <p className="text-[13px] leading-relaxed text-muted-foreground">{p.body}</p>
              </div>
            </Reveal>
          ))}
        </div>

        <div className="mt-8 flex flex-wrap items-center gap-3">
          <DemoButton label="Explore the live demo — no login" />
          <span className="text-[12px] text-muted-foreground">
            Loads a sample estate instantly. No file, no credentials.
          </span>
        </div>

        <p className="mt-6 max-w-2xl text-[12px] leading-relaxed text-muted-foreground">
          Honest by design: cost and metrics need a live connection — that data isn&apos;t in an
          infrastructure file, so those views stay clearly disabled in file mode.
        </p>
      </div>
    </section>
  );
}

/* -----------------------------------------------------------
 * Algorithms — the "under the hood" credibility section
 * -----------------------------------------------------------*/

export function Algorithms() {
  const byField = new Map<string, Array<{ name: string; role: string }>>();
  for (const a of Object.values(ALGORITHMS)) {
    if (!byField.has(a.field)) byField.set(a.field, []);
    byField.get(a.field)!.push({ name: a.name, role: a.role });
  }
  const fields = [...byField.entries()];

  return (
    <section id="algorithms" className="relative border-b border-border/60 bg-muted/20">
      <div className="cc-glow pointer-events-none absolute inset-0 opacity-25" aria-hidden />
      <div className="relative mx-auto max-w-6xl px-5 py-20 md:px-8 md:py-24">
        <div className="mb-12 max-w-3xl">
          <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-primary">
            <LiveDot />
            Under the hood
          </div>
          <h2 className="mt-3 font-display text-[32px] leading-tight tracking-tight md:text-[46px]">
            Named algorithms. No black box.
          </h2>
          <p className="mt-4 text-[14.5px] leading-relaxed text-muted-foreground">
            Every intelligence feature is a peer-reviewed technique you can
            look up, audit, and reproduce — running in your browser, on data
            already fetched. No LLM, no external inference, nothing leaves
            your tenant. Each in-app view names the algorithm powering it.
          </p>
        </div>
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {fields.map(([field, algos], i) => (
            <Reveal key={field} delay={i * 90} className="h-full">
            <div className="cc-panel h-full rounded-xl p-5">
              <div className="mb-3 flex items-baseline justify-between border-b pb-3">
                <h3 className="font-mono text-[11px] font-semibold uppercase tracking-[0.13em] text-primary">
                  {field}
                </h3>
                <span className="font-mono text-[10.5px] tabular-nums text-muted-foreground">
                  {algos.length.toString().padStart(2, "0")}
                </span>
              </div>
              <ul className="space-y-2.5">
                {algos.map((a) => (
                  <li key={a.name}>
                    <div className="font-mono text-[12.5px] font-medium text-foreground">
                      {a.name}
                    </div>
                    <div className="text-[11.5px] leading-snug text-muted-foreground">
                      {a.role}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
            </Reveal>
          ))}
        </div>
        <p className="mt-8 font-mono text-[11px] text-muted-foreground">
          Holt-Winters · Theil-Sen · k-means++ · Dijkstra · Tarjan · CUSUM ·
          PELT · First-Fit-Decreasing · CIDR/port interval algebra · MAD
          z-score — all client-side, all auditable.
        </p>
      </div>
    </section>
  );
}

/* -----------------------------------------------------------
 * Read-only manifesto
 * -----------------------------------------------------------*/

export function ReadOnlyManifesto() {
  const layers: Array<{
    id: string;
    heading: string;
    proof: string;
    body: string;
  }> = [
    {
      id: "L1",
      heading: "GET-only ARM proxy",
      proof: "405 on POST · PUT · PATCH · DELETE",
      body: "The proxy that talks to Azure only accepts read verbs. Any request that would create, change, or delete a resource is rejected before it leaves the app.",
    },
    {
      id: "L2",
      heading: "Query engine, not a mutation surface",
      proof: "Kusto has no INSERT · UPDATE · DELETE",
      body: "Cross-subscription searches go through Azure's read-only query engine. It has no write primitives — no query text can ever change a resource, by design.",
    },
    {
      id: "L3",
      heading: "No write SDK loaded",
      proof: "@azure/arm-* not in the bundle",
      body: "The Azure client libraries that could theoretically perform write operations are never imported. Adding one is a diff a reviewer can catch.",
    },
    {
      id: "L4",
      heading: "State stays in the browser",
      proof: "IndexedDB · no server DB · no KV",
      body: "Drift snapshots and anomaly baselines are cached in your own browser and never sent to a server. There is no server copy to leak.",
    },
  ];
  return (
    <section id="read-only" className="relative border-b border-border/60 bg-muted/10">
      <div className="mx-auto max-w-6xl px-5 py-20 md:px-8 md:py-24">
        <div className="mb-12 max-w-3xl">
          <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-primary">
            <LiveDot />
            The guarantee
          </div>
          <h2 className="mt-3 font-display text-[36px] leading-tight tracking-tight md:text-[50px]">
            Four layers. Zero write paths.
          </h2>
          <p className="mt-4 text-[14.5px] leading-relaxed text-muted-foreground">
            Not a policy or a checklist. Four independent defensive layers in
            code make mutation architecturally impossible. All four must fail
            simultaneously for a write to happen — and the middle two are
            impossible to bypass at all.
          </p>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          {layers.map((l) => (
            <div key={l.id} className="cc-panel rounded-xl p-5">
              <div className="flex items-center gap-3">
                <span className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-primary/40 bg-primary/10 font-mono text-[11px] font-bold text-primary">
                  {l.id}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="font-display text-[16px] leading-tight tracking-tight">
                    {l.heading}
                  </div>
                  <div className="mt-0.5 truncate font-mono text-[10.5px] text-muted-foreground">
                    {l.proof}
                  </div>
                </div>
              </div>
              <p className="mt-4 text-[13px] leading-relaxed text-muted-foreground">
                {l.body}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* -----------------------------------------------------------
 * Capability list — full coverage
 * -----------------------------------------------------------*/

export function CapabilityList() {
  const groups: Array<{ label: string; items: Array<[string, string]> }> = [
    { label: "Inventory", items: [
      ["Resource Groups", "tags, location, provisioning state"],
      ["Virtual Machines", "size, OS, live power state, CIS/STIG hardening"],
      ["App Services", "HTTPS-only, plan, kind (Function detection)"],
      ["Storage Accounts", "public blob, HTTPS, network default"],
      ["SQL Servers", "version, FQDN, state"],
    ]},
    { label: "Networking", items: [
      ["Network Security Groups", "risk classifier, orphan detection"],
      ["Public IP Addresses", "attachment, SKU, waste alerts"],
      ["Application Gateways", "backend pools, WAF status"],
      ["Network Flow Analyzer", "effective rules + traffic simulator"],
    ]},
    { label: "Cost & Optimization", items: [
      ["Azure Advisor (Cost)", "impact-ranked recommendations"],
      ["RI & Quotas", "live PAYG vs 1-Yr / 3-Yr RI"],
      ["Cost Attribution", "tag pivots, untagged spend"],
      ["VM Right-Sizing", "Advisor + live price delta + confidence"],
      ["Orphan Resources", "waste $/mo with cleanup commands"],
      ["Multi-Sub Summary", "streaming cross-sub roll-up"],
    ]},
    { label: "Security & Compliance", items: [
      ["Well-Architected Review", "5-pillar scoring"],
      ["CIS Benchmark Audit", "12 automated controls"],
      ["Blast Radius Analyzer", "VM/VNet/NSG dependencies"],
      ["Key Vault Audit", "soft-delete, purge, network"],
    ]},
    { label: "Monitoring", items: [
      ["VM Backups", "Recovery Services Vault health"],
      ["Monitor Alerts", "activity log · 1h / 7d / 30d"],
      ["Monitor Metrics", "CPU / memory / net / disk chart"],
    ]},
    { label: "Tools", items: [
      ["Cloud Drift Detector", "snapshots stored in your browser · risk classifier"],
      ["Resource Graph Explorer", "KQL editor · 12 templates"],
      ["Technical Documentation", "auth, architecture, security"],
    ]},
  ];
  const totalViews = groups.reduce((s, g) => s + g.items.length, 0);
  return (
    <section id="capabilities" className="relative border-b border-border/60">
      <div className="mx-auto max-w-6xl px-5 py-20 md:px-8 md:py-24">
        <div className="mb-12 flex flex-wrap items-end justify-between gap-6">
          <div className="max-w-3xl">
            <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-primary">
              <LiveDot />
              Full coverage
            </div>
            <h2 className="mt-3 font-display text-[32px] leading-tight tracking-tight md:text-[46px]">
              {totalViews} views. One shell.
            </h2>
            <p className="mt-4 text-[14.5px] leading-relaxed text-muted-foreground">
              Every view is wired end-to-end against Azure Resource Manager.
              Read-only across the board. Exportable to CSV and branded PDF.
            </p>
          </div>
        </div>
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {groups.map((g) => (
            <div key={g.label} className="cc-panel rounded-xl p-5">
              <div className="flex items-baseline justify-between border-b pb-3">
                <h3 className="font-display text-[18px] tracking-tight">{g.label}</h3>
                <span className="font-mono text-[10.5px] tabular-nums text-primary">
                  {g.items.length.toString().padStart(2, "0")}
                </span>
              </div>
              <dl className="mt-3 space-y-2">
                {g.items.map(([name, note]) => (
                  <div key={name} className="flex items-baseline gap-2">
                    <span className="mt-1 h-1 w-1 shrink-0 rounded-full bg-primary" />
                    <div className="min-w-0 flex-1">
                      <dt className="text-[12.5px] font-medium">{name}</dt>
                      <dd className="text-[11px] text-muted-foreground">{note}</dd>
                    </div>
                  </div>
                ))}
              </dl>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* -----------------------------------------------------------
 * Sign in
 * -----------------------------------------------------------*/

export function SignIn() {
  return (
    <section id="sign-in" className="relative overflow-hidden border-b border-border/60">
      <div className="cc-glow pointer-events-none absolute inset-0 opacity-40" aria-hidden />
      <div className="relative mx-auto grid max-w-6xl gap-12 px-5 py-24 md:grid-cols-[minmax(0,0.9fr)_minmax(0,1fr)] md:gap-16 md:px-8">
        <div className="max-w-md">
          <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-primary">
            <LiveDot />
            Connect
          </div>
          <h2 className="mt-3 font-display text-[38px] leading-[1.02] tracking-tight md:text-[48px]">
            Open the console.
          </h2>
          <p className="mt-4 text-[14.5px] leading-relaxed text-muted-foreground">
            Point {BRAND.name} at your tenant in under a minute. Sign in with
            your own Azure AD account — no app-registration permissions
            needed — or paste in a Service Principal you already have.
            Either way, the console can only read.
          </p>
          <div className="mt-8 space-y-2 text-[13.5px]">
            <div className="flex items-start gap-2">
              <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
              <span>Reader is all it needs. Nothing higher, nothing broader.</span>
            </div>
            <div className="flex items-start gap-2">
              <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
              <span>MSPs: Lighthouse-aware. Every delegated subscription in one shell.</span>
            </div>
            <div className="flex items-start gap-2">
              <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
              <span>No agents, no policies, nothing to deploy inside Azure.</span>
            </div>
          </div>
        </div>
        <div className="flex md:justify-end">
          <LoginForm />
        </div>
      </div>
    </section>
  );
}

/* -----------------------------------------------------------
 * FAQ
 * -----------------------------------------------------------*/

export function Faq() {
  const faqs: Array<{ q: string; a: React.ReactNode }> = [
    { q: "How is this different from an inventory viewer?", a: "Inventory is the entry point, not the product. Meridian traces network paths for any VM, simulates NSG traffic decisions, scores your estate against the Well-Architected Framework, audits twelve CIS controls, grades every Advisor right-sizing suggestion against real metrics, classifies drift changes by risk, and flags anomalies against your own baselines." },
    { q: "Do the intelligence signals stay read-only?", a: "Yes. All three signals — right-sizing verdicts, drift risk, and anomaly detection — are pure classifiers running in your browser on data Meridian already fetched. The only new Azure calls are GETs to Azure Monitor for VM CPU metrics. Baselines live in your browser's IndexedDB, never on a server." },
    { q: "Can this app modify anything in my Azure account?", a: "No. Every request the app makes to Azure is a read. Any write attempt is rejected before it leaves the app, and no write client is loaded in the first place." },
    { q: "Where do my credentials live?", a: "Encrypted server-side and referenced by a session cookie your browser cannot read. The session expires after 8 hours or when you click Logout." },
    { q: "What data do you keep server-side?", a: "Almost nothing, and only transiently. VM prices (public data) are cached briefly, and recent cost totals are cached at the edge for a few hours — each entry scoped to your own credentials so no other user can ever read it — purely to stay within Azure's Cost Management rate limits. No inventory, drift snapshots, or anomaly baselines are ever stored server-side; those live only in your browser." },
    { q: "Do I need to install anything in Azure?", a: "No. Either sign in with your own Azure AD account (no app registration needed in your tenant) or paste in a Service Principal you already have." },
    { q: "Are the prices real or estimates?", a: "VM PAYG / 1-Yr / 3-Yr RI rates come from Microsoft's public Azure Retail Prices API. Disks, IPs, storage, and App Services use conservative fallback rates when usage-based cost can't be inferred from inventory alone." },
    { q: "Is Azure Lighthouse supported?", a: "Yes. Tick the Lighthouse checkbox on the login form. Every subscription your account can see is listed and marked as either HOME or delegated." },
  ];
  return (
    <section id="faq" className="relative border-b border-border/60">
      <div className="mx-auto max-w-3xl px-5 py-20 md:px-8 md:py-24">
        <div className="mb-10">
          <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-primary">
            <LiveDot />
            FAQ
          </div>
          <h2 className="mt-3 font-display text-[30px] leading-tight tracking-tight md:text-[42px]">
            The questions everyone asks first.
          </h2>
        </div>
        <dl className="space-y-2">
          {faqs.map((f) => (
            <details
              key={f.q}
              className="group cc-panel rounded-lg px-5 py-4 [&_summary::-webkit-details-marker]:hidden"
            >
              <summary className="flex cursor-pointer items-center justify-between gap-4 text-[14px] font-semibold">
                {f.q}
                <span className="text-lg leading-none text-primary transition-transform group-open:rotate-45">
                  +
                </span>
              </summary>
              <p className="mt-3 max-w-2xl text-[13.5px] leading-relaxed text-muted-foreground">
                {f.a}
              </p>
            </details>
          ))}
        </dl>
      </div>
    </section>
  );
}

/* -----------------------------------------------------------
 * Family
 * -----------------------------------------------------------*/

export function Family() {
  return (
    <section id="family" className="border-b border-border/60 bg-card/30">
      <div className="mx-auto max-w-6xl px-5 py-24 md:px-8">
        <SectionHead eyebrow="The family" title="More from Arunim's IT Caffe"
          subtitle="Independent tools for cloud operators. Small, sharp, opinionated." />
        <dl className="mt-14 divide-y border-y">
          {FAMILY_PRODUCTS.map((p) => (<FamilyRow key={p.name} product={p} />))}
        </dl>
      </div>
    </section>
  );
}

function FamilyRow({ product }: { product: FamilyProduct }) {
  const isCurrent = product.status === "current";
  const isSoon = product.status === "coming-soon";
  const content = (
    <div className="grid items-baseline gap-6 py-7 md:grid-cols-[minmax(0,0.55fr)_minmax(0,1fr)] md:gap-16">
      <div>
        <div className="flex items-baseline gap-3">
          <span className="font-display text-[28px] leading-none tracking-tight">{product.name}</span>
          {isCurrent && <span className="rounded-full border border-primary/40 bg-primary/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-primary">You are here</span>}
          {isSoon && <span className="rounded-full border bg-muted px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Coming soon</span>}
        </div>
        <div className="mt-1.5 text-[11.5px] font-medium uppercase tracking-[0.13em] text-muted-foreground">{product.tagline}</div>
      </div>
      <div className="flex flex-col gap-3">
        <p className="max-w-xl text-[14px] leading-relaxed text-muted-foreground">{product.description}</p>
        {product.url && product.domain && (
          <span className="inline-flex w-fit items-center gap-1.5 rounded-md border border-primary/40 bg-primary/10 px-3 py-1.5 text-[13px] font-semibold text-primary transition-colors group-hover:bg-primary/20">
            Visit {product.domain}
            <ExternalLink className="h-3.5 w-3.5" />
          </span>
        )}
      </div>
    </div>
  );
  if (product.url && !isCurrent) {
    return (
      <a href={product.url} target="_blank" rel="noopener noreferrer" className="group block transition-colors hover:bg-muted/40">
        {content}
      </a>
    );
  }
  return <div>{content}</div>;
}

/* -----------------------------------------------------------
 * Footer
 * -----------------------------------------------------------*/

export function Footer() {
  return (
    <footer className="relative border-t border-border/60 bg-background">
      {/* System status bar — thin strip across the top of the footer. */}
      <div className="border-b bg-muted/30">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-1 px-5 py-2.5 font-mono text-[10.5px] md:px-8">
          <span className="inline-flex items-center gap-2 text-success">
            <LiveDot />
            live from Azure
          </span>
          <span className="hidden text-muted-foreground md:inline">·</span>
          <span className="text-muted-foreground">
            read-only <span className="text-success">verified</span>
          </span>
          <span className="hidden text-muted-foreground md:inline">·</span>
          <span className="text-muted-foreground">Reader role · no writes, ever</span>
        </div>
      </div>

      <div className="mx-auto max-w-6xl px-5 py-14 md:px-8">
        <div className="grid gap-10 md:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1fr)]">
          {/* Brand column */}
          <div>
            <div className="flex items-baseline gap-3">
              <span className="font-display text-[28px] leading-none tracking-tight">
                {BRAND.name}
              </span>
              <Badge variant="success" className="gap-1">
                <ShieldCheck className="h-3 w-3" />
                READ-ONLY
              </Badge>
            </div>
            <p className="mt-3 max-w-xs text-[13px] leading-relaxed text-muted-foreground">
              {BRAND.tagline}. No agents. No writes. Reader on Azure is all it
              needs.
            </p>
            <Link
              href="/#sign-in"
              className="mt-4 inline-flex items-center gap-1.5 rounded-md border bg-card/60 px-3 py-1.5 text-[12px] font-medium hover:bg-muted/40"
            >
              <LiveDot />
              Open the console
            </Link>
          </div>

          {/* Nav column */}
          <div>
            <div className="mb-4 font-mono text-[10.5px] font-semibold uppercase tracking-[0.14em] text-primary">
              Explore
            </div>
            <ul className="space-y-2 text-[13px]">
              <li>
                <Link href="/features" className="hover:text-foreground">
                  Features
                </Link>
              </li>
              <li>
                <Link href="/security" className="hover:text-foreground">
                  Security &amp; guarantee
                </Link>
              </li>
              <li>
                <Link href="/handbook" className="hover:text-foreground">
                  The handbook
                </Link>
              </li>
              <li>
                <Link href="/family" className="hover:text-foreground">
                  Family of products
                </Link>
              </li>
              <li>
                <Link href="/#sign-in" className="hover:text-foreground">
                  Sign in →
                </Link>
              </li>
            </ul>
          </div>

          {/* Attribution column */}
          <div>
            <div className="mb-4 font-mono text-[10.5px] font-semibold uppercase tracking-[0.14em] text-primary">
              Made by
            </div>
            <p className="text-[13.5px] font-semibold">Arunim&apos;s IT Caffe</p>
            <p className="mt-1 max-w-xs text-[12.5px] leading-relaxed text-muted-foreground">
              Independent tooling for cloud operators.
            </p>
            <Link
              href="/family"
              className="mt-4 inline-flex items-center gap-1.5 text-[12.5px] font-medium hover:text-foreground"
            >
              <ArrowRight className="h-3.5 w-3.5" />
              See all our products
            </Link>
          </div>
        </div>

        {/* Bottom line */}
        <div className="mt-12 flex flex-col gap-2 border-t pt-6 font-mono text-[10.5px] text-muted-foreground md:flex-row md:items-center md:justify-between">
          <div>
            © {new Date().getFullYear()} {BRAND.name} · {BRAND.attribution}
          </div>
          <div className="text-muted-foreground/70">
            no server database · no data retention · no vendor lock-in
          </div>
        </div>
      </div>
    </footer>
  );
}

/* -----------------------------------------------------------
 * Shared section header
 * -----------------------------------------------------------*/

export function SectionHead({
  eyebrow, title, subtitle,
}: { eyebrow: string; title: string; subtitle?: string }) {
  return (
    <div className="max-w-2xl">
      <div className="mb-4 text-[11.5px] font-semibold uppercase tracking-[0.13em] text-primary">{eyebrow}</div>
      <h2 className="font-display text-[38px] leading-[1.02] tracking-tight md:text-[48px]">{title}</h2>
      {subtitle && <p className="mt-4 text-[15px] leading-relaxed text-muted-foreground">{subtitle}</p>}
    </div>
  );
}
