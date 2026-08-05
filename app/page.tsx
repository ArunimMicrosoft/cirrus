"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  ArrowUpRight,
  CheckCircle2,
  ExternalLink,
  Radio,
  ShieldCheck,
} from "lucide-react";
import { LoginForm } from "@/components/auth/LoginForm";
import { useAuthState } from "@/lib/hooks/use-auth";
import { ThemeToggle } from "@/components/layout/ThemeToggle";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { BRAND } from "@/lib/brand";
import { FAMILY_PRODUCTS, type FamilyProduct } from "@/lib/products";

export default function LandingPage() {
  const router = useRouter();
  const { data, isSuccess } = useAuthState();

  useEffect(() => {
    if (isSuccess && data?.authenticated) {
      router.replace("/dashboard");
    }
  }, [data, isSuccess, router]);

  return (
    <div className="relative min-h-screen bg-background text-foreground">
      <TopNav />
      <Hero />
      <MetricsRow />
      <ProductStory />
      <ReadOnlyManifesto />
      <CapabilityList />
      <SignIn />
      <Faq />
      <Family />
      <Footer />
    </div>
  );
}

/* -----------------------------------------------------------
 * Nav — minimal wordmark
 * -----------------------------------------------------------*/

function TopNav() {
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
          <a href="#product" className="hover:text-foreground">
            Product
          </a>
          <a href="#read-only" className="hover:text-foreground">
            Guarantee
          </a>
          <a href="#capabilities" className="hover:text-foreground">
            Capabilities
          </a>
          <a href="#family" className="hover:text-foreground">
            Family
          </a>
          <a href="#faq" className="hover:text-foreground">
            FAQ
          </a>
        </nav>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <Button asChild size="sm">
            <a href="#sign-in">
              Connect <ArrowRight className="h-3.5 w-3.5" />
            </a>
          </Button>
        </div>
      </div>
    </header>
  );
}

/* -----------------------------------------------------------
 * Hero — asymmetric, serif headline, product mock on the right
 * -----------------------------------------------------------*/

function Hero() {
  return (
    <section className="relative overflow-hidden border-b border-border/60">
      <div className="dot-grid pointer-events-none absolute inset-0 opacity-70" aria-hidden />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-72 bg-gradient-to-b from-background via-background/60 to-transparent" aria-hidden />
      <div className="relative mx-auto grid max-w-6xl gap-14 px-5 py-16 md:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] md:gap-10 md:px-8 md:py-24 lg:gap-16">
        <div className="max-w-xl">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-border/70 bg-card/70 px-3 py-1 text-[11.5px] font-medium text-muted-foreground backdrop-blur">
            <ShieldCheck className="h-3 w-3 text-emerald-600 dark:text-emerald-400" />
            100% read-only · Reader role on Azure is all you need
          </div>
          <h1 className="font-display text-[44px] leading-[0.98] tracking-tight md:text-[68px]">
            Read your Azure.
            <br />
            <span className="text-muted-foreground">Never write it.</span>
          </h1>
          <p className="mt-6 max-w-lg text-[15.5px] leading-relaxed text-muted-foreground">
            <strong className="font-semibold text-foreground">{BRAND.name}</strong> goes
            past inventory. It <span className="text-foreground">traces network paths hop-by-hop</span>,
            <span className="text-foreground"> validates your estate against the Well-Architected Framework</span>,
            <span className="text-foreground"> simulates NSG traffic decisions</span>,
            and <span className="text-foreground">audits against CIS Azure Benchmark</span> —
            for every subscription in your tenant. All read-only. All read
            live from Azure.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Button asChild size="lg">
              <a href="#sign-in">
                Connect a Service Principal
                <ArrowRight className="h-4 w-4" />
              </a>
            </Button>
            <a
              href="#capabilities"
              className="inline-flex items-center gap-1.5 text-[13.5px] font-medium text-foreground hover:underline"
            >
              See all 22 views
              <ArrowUpRight className="h-3.5 w-3.5" />
            </a>
          </div>
          <div className="mt-8 flex items-center gap-6 text-[12px] text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
              Live prices from Retail Prices API
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
              Lighthouse-aware
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
              Zero data retention
            </span>
          </div>
        </div>

        <ProductMock />
      </div>
    </section>
  );
}

/**
 * Faux product screenshot rendered in JSX. Deliberately not centered or
 * card-in-card — it looks like a real slice of the app.
 */
function ProductMock() {
  const rows = [
    { name: "aks-runner-01", size: "Standard_D4s_v5", region: "eastus", state: "running", cost: "$182.50" },
    { name: "sql-primary", size: "Standard_E8s_v5", region: "eastus", state: "running", cost: "$412.10" },
    { name: "batch-node-02", size: "Standard_D8s_v5", region: "westeu", state: "deallocated", cost: "$0.00" },
    { name: "jump-box", size: "Standard_B2ms", region: "eastus", state: "running", cost: "$60.80" },
    { name: "reporting-web", size: "Standard_D2s_v5", region: "eastus", state: "running", cost: "$70.10" },
    { name: "legacy-ftp", size: "Standard_A2_v2", region: "westus", state: "stopped", cost: "$44.90" },
  ];
  return (
    <div className="relative">
      <div className="pointer-events-none absolute -left-6 -top-6 -z-10 h-full w-full rounded-2xl bg-gradient-to-tr from-primary/20 via-primary/5 to-transparent blur-2xl" aria-hidden />
      <div className="overflow-hidden rounded-xl border border-border/80 bg-card shadow-[0_20px_60px_-15px_rgba(15,23,42,0.15)] dark:shadow-[0_20px_60px_-15px_rgba(0,0,0,0.6)]">
        {/* Fake window chrome */}
        <div className="flex items-center gap-2 border-b bg-muted/40 px-4 py-2.5">
          <div className="flex gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-[#ff5f57]" />
            <span className="h-2.5 w-2.5 rounded-full bg-[#febc2e]" />
            <span className="h-2.5 w-2.5 rounded-full bg-[#28c840]" />
          </div>
          <div className="mx-auto rounded-md bg-background/70 px-2 py-0.5 font-mono text-[10.5px] text-muted-foreground">
            /inventory/virtual-machines
          </div>
        </div>
        {/* Page header */}
        <div className="flex items-center justify-between gap-3 border-b bg-card px-4 py-3.5">
          <div>
            <div className="text-[13px] font-semibold">Virtual Machines</div>
            <div className="text-[10.5px] text-muted-foreground">
              6 VMs · 4 running · 1 deallocated · 1 stopped
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="rounded-md border px-1.5 py-0.5 text-[9.5px] font-medium">
              CSV
            </span>
            <span className="rounded-md border px-1.5 py-0.5 text-[9.5px] font-medium">
              PDF
            </span>
          </div>
        </div>
        {/* Table */}
        <div className="max-h-[280px] overflow-hidden">
          <table className="w-full text-[11.5px]">
            <thead className="bg-muted/50 text-[9.5px] uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left font-semibold">Name</th>
                <th className="px-3 py-2 text-left font-semibold">Status</th>
                <th className="px-3 py-2 text-left font-semibold">Size</th>
                <th className="px-3 py-2 text-left font-semibold">Region</th>
                <th className="px-3 py-2 text-right font-semibold">Est./mo</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.name} className={cn("border-t", i % 2 === 0 && "bg-card")}>
                  <td className="px-3 py-2 font-medium">{r.name}</td>
                  <td className="px-3 py-2">
                    <MockStatus state={r.state} />
                  </td>
                  <td className="px-3 py-2 font-mono text-[10.5px] text-muted-foreground">
                    {r.size}
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">{r.region}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{r.cost}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      {/* Floating chip */}
      <div className="absolute -right-4 bottom-6 hidden rounded-lg border bg-background px-3 py-2 shadow-lg md:block">
        <div className="flex items-center gap-2 text-[10.5px]">
          <Radio className="h-3 w-3 text-emerald-500" />
          <span className="font-semibold">Live prices</span>
          <span className="text-muted-foreground">/ Retail Prices API</span>
        </div>
      </div>
    </div>
  );
}

function MockStatus({ state }: { state: string }) {
  if (state === "running")
    return (
      <span className="inline-flex items-center gap-1 rounded-md bg-emerald-500/12 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700 dark:text-emerald-400">
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
        running
      </span>
    );
  if (state === "deallocated")
    return (
      <span className="inline-flex items-center gap-1 rounded-md bg-amber-500/12 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700 dark:text-amber-400">
        deallocated
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1 rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">
      {state}
    </span>
  );
}

/* -----------------------------------------------------------
 * Metrics row — inline text stats, no card grid
 * -----------------------------------------------------------*/

function MetricsRow() {
  return (
    <section className="border-b border-border/60 bg-card/30">
      <div className="mx-auto grid max-w-6xl grid-cols-2 gap-y-6 px-5 py-10 md:grid-cols-4 md:px-8">
        <Metric value="22" label="Resource views" />
        <Metric value="0" label="Write operations" />
        <Metric value="Reader" label="Azure role required" />
        <Metric value="~5 min" label="Setup time" />
      </div>
    </section>
  );
}

function Metric({ value, label }: { value: string; label: string }) {
  return (
    <div className="flex flex-col">
      <span className="font-display text-3xl leading-none tracking-tight md:text-4xl">
        {value}
      </span>
      <span className="mt-1.5 text-[11.5px] font-medium uppercase tracking-[0.11em] text-muted-foreground">
        {label}
      </span>
    </div>
  );
}

/* -----------------------------------------------------------
 * Product story — three moments of the app, with mockups
 * -----------------------------------------------------------*/

function ProductStory() {
  return (
    <section id="product" className="border-b border-border/60">
      <div className="mx-auto max-w-6xl px-5 py-24 md:px-8">
        <SectionHead
          eyebrow="Beyond inventory"
          title="Not just a list of resources."
          subtitle="Cirrus answers the questions an inventory tool stops at — which VMs are reachable, what your architecture scores against WAF, which CIS controls fail, which RIs would pay back."
        />
        <div className="mt-14 space-y-24">
          <Moment
            number="01"
            eyebrow="Network path"
            title="Trace traffic hop-by-hop from source to VM"
            body="Pick any VM and Cirrus walks the network chain — NIC, subnet, NSG, effective rules, route table, public IP — reproducing the same source-to-destination trace az network watcher gives you. Then the traffic simulator evaluates a given (source, port) against every rule in priority order and shows exactly which one matched."
            mock={<TrafficMock />}
          />
          <Moment
            number="02"
            eyebrow="Well-Architected"
            title="Score your estate against Microsoft's five pillars"
            body="Cost, Reliability, Security, Operational Excellence, Performance Efficiency. Every VM, storage account, key vault, and public IP is scored against the WAF checklist with letter grades and an overall roll-up. Findings link back to the exact resource — no leaving the report to drill in."
            mock={<WafMock />}
            reverse
          />
          <Moment
            number="03"
            eyebrow="CIS Benchmark"
            title="Twelve CIS controls, run on every load"
            body="RDP, SSH, and database ports open to the Internet. Storage accounts allowing HTTP or public blobs. Key Vaults without purge protection. App Services that don't enforce HTTPS. All flagged with the CIS control ID they violate, ready to export as an audit PDF."
            mock={<RiskMock />}
          />
          <Moment
            number="04"
            eyebrow="Live spend"
            title="Real prices from the Azure Retail Prices API"
            body="Every VM cost is pulled from Microsoft's public Retail Prices API for the exact SKU and region. PAYG, 1-year RI, and 3-year RI rates arrive in the same round trip. Cached 24 hours per (SKU, region) so a 200-VM estate typically hits the API less than fifteen times."
            mock={<SpendMock />}
            reverse
          />
        </div>
      </div>
    </section>
  );
}

function Moment({
  number,
  eyebrow,
  title,
  body,
  mock,
  reverse,
}: {
  number: string;
  eyebrow: string;
  title: string;
  body: string;
  mock: React.ReactNode;
  reverse?: boolean;
}) {
  return (
    <div
      className={cn(
        "grid items-center gap-10 md:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] md:gap-16",
        reverse && "md:[&>*:first-child]:order-2",
      )}
    >
      <div>
        <div className="mb-3 flex items-baseline gap-3">
          <span className="font-display text-4xl leading-none tracking-tight text-muted-foreground/60">
            {number}
          </span>
          <span className="text-[11.5px] font-semibold uppercase tracking-[0.13em] text-primary">
            {eyebrow}
          </span>
        </div>
        <h3 className="font-display text-[30px] leading-[1.05] tracking-tight md:text-[36px]">
          {title}
        </h3>
        <p className="mt-4 max-w-md text-[14.5px] leading-relaxed text-muted-foreground">
          {body}
        </p>
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
    <div className="rounded-xl border bg-card p-5 shadow-lg shadow-black/[0.03] dark:shadow-black/40">
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
    <div className="rounded-xl border bg-card p-5 shadow-lg shadow-black/[0.03] dark:shadow-black/40">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-[12px] font-semibold">CIS Benchmark</span>
        <span className="rounded-md bg-amber-500/12 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700 dark:text-amber-400">
          67% compliant
        </span>
      </div>
      <div className="space-y-1.5">
        {checks.map(([id, label, status]) => (
          <div
            key={id}
            className="flex items-center gap-2 rounded-md border bg-background/60 px-2.5 py-1.5 text-[11.5px]"
          >
            <span className="font-mono text-[10px] font-semibold text-muted-foreground">
              {id}
            </span>
            <span className="flex-1">{label}</span>
            {status === "pass" && (
              <span className="rounded bg-emerald-500/12 px-1.5 py-0.5 text-[9.5px] font-semibold text-emerald-700 dark:text-emerald-400">
                PASS
              </span>
            )}
            {status === "fail" && (
              <span className="rounded bg-rose-500/12 px-1.5 py-0.5 text-[9.5px] font-semibold text-rose-700 dark:text-rose-400">
                FAIL
              </span>
            )}
            {status === "review" && (
              <span className="rounded bg-amber-500/12 px-1.5 py-0.5 text-[9.5px] font-semibold text-amber-700 dark:text-amber-400">
                REVIEW
              </span>
            )}
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
    <div className="rounded-xl border bg-card p-5 shadow-lg shadow-black/[0.03] dark:shadow-black/40">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-[12px] font-semibold">Traffic simulator</span>
        <span className="rounded-md bg-rose-500/12 px-1.5 py-0.5 text-[10px] font-semibold text-rose-700 dark:text-rose-400">
          DENY
        </span>
      </div>
      <div className="mb-3 space-y-1 text-[11.5px]">
        <SimField k="Source" v="0.0.0.0/0" />
        <SimField k="Port" v="22 (SSH)" />
        <SimField k="Protocol" v="TCP" />
      </div>
      <div className="rounded-md border bg-muted/30 p-2 font-mono text-[10.5px]">
        {trace.map((t) => (
          <div
            key={t.prio}
            className={cn(
              "flex justify-between",
              t.result === "match" && "text-rose-600 dark:text-rose-400",
            )}
          >
            <span>
              <span className="text-muted-foreground">{t.prio}</span> · {t.name}
            </span>
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
      <span className="text-[9.5px] font-semibold uppercase tracking-wider text-muted-foreground">
        {k}
      </span>
      <span className="font-mono text-[11px]">{v}</span>
    </div>
  );
}

function WafMock() {
  const pillars: Array<[string, number, string]> = [
    ["Cost", 88, "A"],
    ["Reliability", 62, "C"],
    ["Security", 45, "F"],
    ["Ops. Excellence", 74, "B"],
    ["Performance", 91, "A"],
  ];
  const overall = Math.round(
    pillars.reduce((s, [, v]) => s + v, 0) / pillars.length,
  );
  return (
    <div className="rounded-xl border bg-card p-5 shadow-lg shadow-black/[0.03] dark:shadow-black/40">
      <div className="mb-4 flex items-center justify-between">
        <span className="text-[12px] font-semibold">Well-Architected Review</span>
        <span className="inline-flex items-center gap-1 rounded-md bg-amber-500/12 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700 dark:text-amber-400">
          Overall {overall} · B
        </span>
      </div>
      <div className="space-y-2.5">
        {pillars.map(([name, score, grade]) => {
          const bar =
            score >= 80
              ? "bg-emerald-500"
              : score >= 60
                ? "bg-amber-500"
                : "bg-rose-500";
          const chip =
            score >= 80
              ? "bg-emerald-500/12 text-emerald-700 dark:text-emerald-400"
              : score >= 60
                ? "bg-amber-500/12 text-amber-700 dark:text-amber-400"
                : "bg-rose-500/12 text-rose-700 dark:text-rose-400";
          return (
            <div key={name} className="flex items-center gap-2.5 text-[11.5px]">
              <span className="w-[96px] shrink-0 truncate text-muted-foreground">
                {name}
              </span>
              <div className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                <div
                  className={cn("absolute inset-y-0 left-0 rounded-full", bar)}
                  style={{ width: `${score}%` }}
                />
              </div>
              <span className="w-6 shrink-0 text-right tabular-nums text-muted-foreground">
                {score}
              </span>
              <span
                className={cn(
                  "w-5 shrink-0 rounded px-1 py-0.5 text-center text-[9.5px] font-semibold",
                  chip,
                )}
              >
                {grade}
              </span>
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
 * Read-only manifesto — long form prose, not a card grid
 * -----------------------------------------------------------*/

function ReadOnlyManifesto() {
  return (
    <section id="read-only" className="border-b border-border/60 bg-card/30">
      <div className="mx-auto grid max-w-6xl gap-14 px-5 py-24 md:grid-cols-[minmax(0,0.7fr)_minmax(0,1fr)] md:gap-24 md:px-8">
        <div>
          <div className="text-[11.5px] font-semibold uppercase tracking-[0.13em] text-primary">
            The guarantee
          </div>
          <h2 className="mt-3 font-display text-[36px] leading-[1.02] tracking-tight md:text-[46px]">
            It literally can't write.
          </h2>
          <p className="mt-4 max-w-md text-[14.5px] leading-relaxed text-muted-foreground">
            Not a policy. Not a checklist. Four defensive layers in code make
            mutation impossible.
          </p>
        </div>
        <div className="space-y-6 text-[14.5px] leading-relaxed">
          <ManifestoLine
            n="1"
            heading="Every Azure call is a read"
            body="The proxy that talks to Azure only accepts read verbs. Any request that would create, change, or delete a resource is rejected before it leaves the app."
          />
          <ManifestoLine
            n="2"
            heading="The query language cannot mutate"
            body="Cross-subscription searches run through Azure's read-only query engine. It has no write primitives — there is no query text that could ever change a resource, by design."
          />
          <ManifestoLine
            n="3"
            heading="No write client exists in the code"
            body="The Azure client libraries that could theoretically perform write operations are never loaded. If a developer ever tried to add one, the app would fail its build check."
          />
          <ManifestoLine
            n="4"
            heading="Your snapshots stay in your browser"
            body="Drift snapshots are cached in your own browser and never sent to a server. Deleting a snapshot removes it locally — Azure is untouched, and there is no server copy to leak."
          />
        </div>
      </div>
    </section>
  );
}

function ManifestoLine({
  n,
  heading,
  body,
}: {
  n: string;
  heading: string;
  body: string;
}) {
  return (
    <div className="flex gap-4 border-l border-border pl-4">
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className="font-display text-lg text-muted-foreground">
            {n}.
          </span>
          <h3 className="text-[15px] font-semibold">{heading}</h3>
        </div>
        <p className="mt-1.5 text-muted-foreground">{body}</p>
      </div>
    </div>
  );
}

/* -----------------------------------------------------------
 * Capability list — dense text listing, not cards
 * -----------------------------------------------------------*/

function CapabilityList() {
  const groups: Array<{
    label: string;
    items: Array<[string, string]>;
  }> = [
    {
      label: "Inventory",
      items: [
        ["Resource Groups", "tags, location, provisioning state"],
        ["Virtual Machines", "size, OS, live power state, CIS/STIG hardening"],
        ["App Services", "HTTPS-only, plan, kind (Function detection)"],
        ["Storage Accounts", "public blob, HTTPS, network default"],
        ["SQL Servers", "version, FQDN, state"],
      ],
    },
    {
      label: "Networking",
      items: [
        ["Network Security Groups", "risk classifier, orphan detection"],
        ["Public IP Addresses", "attachment, SKU, waste alerts"],
        ["Application Gateways", "backend pools, WAF status"],
        ["Network Flow Analyzer", "effective rules + traffic simulator"],
      ],
    },
    {
      label: "Cost & Optimization",
      items: [
        ["Azure Advisor (Cost)", "impact-ranked recommendations"],
        ["RI & Quotas", "live PAYG vs 1-Yr / 3-Yr RI"],
        ["Cost Attribution", "tag pivots, untagged spend"],
        ["VM Right-Sizing", "Advisor + live price delta"],
        ["Orphan Resources", "waste $/mo with cleanup commands"],
        ["Multi-Sub Summary", "streaming cross-sub roll-up"],
      ],
    },
    {
      label: "Security & Compliance",
      items: [
        ["Well-Architected Review", "5-pillar scoring"],
        ["CIS Benchmark Audit", "12 automated controls"],
        ["Blast Radius Analyzer", "VM/VNet/NSG dependencies"],
        ["Key Vault Audit", "soft-delete, purge, network"],
      ],
    },
    {
      label: "Monitoring",
      items: [
        ["VM Backups", "Recovery Services Vault health"],
        ["Monitor Alerts", "activity log · 1h / 7d / 30d"],
        ["Monitor Metrics", "CPU / memory / net / disk chart"],
      ],
    },
    {
      label: "Tools",
      items: [
        ["Cloud Drift Detector", "snapshots stored in your browser"],
        ["Resource Graph Explorer", "KQL editor · 12 templates"],
        ["Technical Documentation", "auth, architecture, security"],
      ],
    },
  ];
  return (
    <section id="capabilities" className="border-b border-border/60">
      <div className="mx-auto max-w-6xl px-5 py-24 md:px-8">
        <SectionHead
          eyebrow="Full coverage"
          title="All 22 views. Every one working end-to-end."
          subtitle="Inventory, cost, security, networking, monitoring, and tools — all in one shell, all read-only."
        />
        <div className="mt-14 grid gap-x-14 gap-y-12 md:grid-cols-2">
          {groups.map((g) => (
            <div key={g.label}>
              <div className="mb-4 flex items-baseline justify-between border-b pb-2">
                <h3 className="font-display text-[22px] tracking-tight">{g.label}</h3>
                <span className="text-[10.5px] font-medium uppercase tracking-[0.13em] text-muted-foreground">
                  {g.items.length} views
                </span>
              </div>
              <dl className="space-y-3">
                {g.items.map(([name, note]) => (
                  <div key={name} className="flex items-baseline gap-3">
                    <CheckCircle2 className="h-3.5 w-3.5 shrink-0 translate-y-[3px] text-primary" />
                    <div className="min-w-0 flex-1">
                      <dt className="text-[13.5px] font-medium">{name}</dt>
                      <dd className="text-[12px] text-muted-foreground">{note}</dd>
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

function SignIn() {
  return (
    <section
      id="sign-in"
      className="relative overflow-hidden border-b border-border/60"
    >
      <div className="dot-grid pointer-events-none absolute inset-0 opacity-50" aria-hidden />
      <div className="relative mx-auto grid max-w-6xl gap-12 px-5 py-24 md:grid-cols-[minmax(0,0.9fr)_minmax(0,1fr)] md:gap-16 md:px-8">
        <div className="max-w-md">
          <div className="text-[11.5px] font-semibold uppercase tracking-[0.13em] text-primary">
            Sign in
          </div>
          <h2 className="mt-3 font-display text-[38px] leading-[1.02] tracking-tight md:text-[46px]">
            Bring a Service Principal.
          </h2>
          <p className="mt-4 text-[14.5px] leading-relaxed text-muted-foreground">
            One command to create it, one form to sign in. Credentials are
            encrypted server-side for eight hours and are never readable from
            your browser. Logout wipes the session immediately.
          </p>
          <pre className="mt-6 overflow-x-auto rounded-lg border bg-card p-4 font-mono text-[12px] leading-relaxed text-muted-foreground">
{`# One command to create the SP
az ad sp create-for-rbac \\
  --name "azure-inventory-utility" \\
  --role Reader \\
  --scopes /subscriptions/YOUR_SUB_ID`}
          </pre>
          <ul className="mt-6 space-y-2 text-[13.5px]">
            <li className="flex items-start gap-2">
              <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
              Reader on each subscription is enough — no other roles required.
            </li>
            <li className="flex items-start gap-2">
              <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
              MSPs: enable Azure Lighthouse and see every delegated tenant.
            </li>
            <li className="flex items-start gap-2">
              <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
              No agents, no policies, nothing to deploy inside your Azure.
            </li>
          </ul>
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

function Faq() {
  const faqs: Array<{ q: string; a: React.ReactNode }> = [
    {
      q: "How is this different from an inventory viewer?",
      a: "Inventory is the entry point, not the product. Cirrus traces end-to-end network paths for any VM, simulates NSG traffic decisions rule-by-rule, scores your estate against the Well-Architected Framework's five pillars, audits twelve CIS controls, cross-references Azure Advisor with live Retail prices for right-sizing, and detects drift between snapshots. Inventory is what feeds those tools.",
    },
    {
      q: "Can this app modify anything in my Azure account?",
      a: "No. Every request the app makes to Azure is a read. Any write attempt is rejected before it leaves the app, and no write client is loaded in the first place.",
    },
    {
      q: "Where do my credentials live?",
      a: "Encrypted server-side and referenced by a session cookie your browser cannot read. The session expires after 8 hours or when you click Logout.",
    },
    {
      q: "What data do you keep server-side?",
      a: "Nothing about your estate. VM prices are cached briefly to avoid hammering Microsoft's public price API. Drift snapshots live in your own browser and never touch a server.",
    },
    {
      q: "Do I need to install anything in Azure?",
      a: "A Service Principal (one command with the Azure CLI) and a Reader role assignment. No agents, no policies, no workspaces.",
    },
    {
      q: "Are the prices real or estimates?",
      a: "VM PAYG / 1-Yr / 3-Yr RI rates come from Microsoft's public Azure Retail Prices API. Disks, IPs, storage, and App Services use conservative fallback rates when usage-based cost can't be inferred from inventory alone.",
    },
    {
      q: "Is Azure Lighthouse supported?",
      a: "Yes. Tick the Lighthouse checkbox on the login form. Every subscription your Service Principal can see is listed and marked as either HOME or delegated.",
    },
  ];
  return (
    <section id="faq" className="border-b border-border/60">
      <div className="mx-auto max-w-3xl px-5 py-24 md:px-8">
        <SectionHead
          eyebrow="Common questions"
          title="Answers to what people ask first"
        />
        <dl className="mt-12 space-y-2">
          {faqs.map((f) => (
            <details
              key={f.q}
              className="group border-b border-border/60 py-4 [&_summary::-webkit-details-marker]:hidden"
            >
              <summary className="flex cursor-pointer items-center justify-between gap-4 text-[14.5px] font-medium">
                {f.q}
                <span className="text-lg leading-none text-muted-foreground transition-transform group-open:rotate-45">
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
 * Family — other products under the Arunim's IT Caffe umbrella
 * -----------------------------------------------------------*/

function Family() {
  return (
    <section id="family" className="border-b border-border/60 bg-card/30">
      <div className="mx-auto max-w-6xl px-5 py-24 md:px-8">
        <SectionHead
          eyebrow="The family"
          title="More from Arunim's IT Caffe"
          subtitle="Independent tools for cloud operators. Small, sharp, opinionated."
        />
        <dl className="mt-14 divide-y border-y">
          {FAMILY_PRODUCTS.map((p) => (
            <FamilyRow key={p.name} product={p} />
          ))}
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
          <span className="font-display text-[28px] leading-none tracking-tight">
            {product.name}
          </span>
          {isCurrent && (
            <span className="rounded-full border border-primary/40 bg-primary/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-primary">
              You are here
            </span>
          )}
          {isSoon && (
            <span className="rounded-full border bg-muted px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Coming soon
            </span>
          )}
        </div>
        <div className="mt-1.5 text-[11.5px] font-medium uppercase tracking-[0.13em] text-muted-foreground">
          {product.tagline}
        </div>
      </div>
      <div className="flex flex-col gap-3">
        <p className="max-w-xl text-[14px] leading-relaxed text-muted-foreground">
          {product.description}
        </p>
        {product.url && product.domain && (
          <span className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-foreground">
            {product.domain}
            <ExternalLink className="h-3 w-3" />
          </span>
        )}
      </div>
    </div>
  );

  if (product.url && !isCurrent) {
    return (
      <a
        href={product.url}
        target="_blank"
        rel="noopener noreferrer"
        className="block transition-colors hover:bg-muted/40"
      >
        {content}
      </a>
    );
  }
  return <div>{content}</div>;
}

/* -----------------------------------------------------------
 * Footer
 * -----------------------------------------------------------*/

function Footer() {
  return (
    <footer className="border-t border-border/60 bg-card/40">
      <div className="mx-auto max-w-6xl px-5 py-12 md:px-8">
        <div className="grid gap-8 md:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1fr)]">
          <div>
            <div className="flex items-baseline gap-2">
              <span className="font-display text-[24px] leading-none tracking-tight">
                {BRAND.name}
              </span>
              <span className="text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
                {BRAND.descriptor}
              </span>
            </div>
            <p className="mt-3 max-w-xs text-[13px] leading-relaxed text-muted-foreground">
              {BRAND.tagline}. No agents. No writes.
            </p>
            <div className="mt-4 flex items-center gap-2">
              <Badge variant="success" className="gap-1">
                <ShieldCheck className="h-3 w-3" />
                READ-ONLY
              </Badge>
              <span className="text-[11px] text-muted-foreground">
                v{BRAND.version}
              </span>
            </div>
          </div>
          <div>
            <div className="mb-3 text-[10.5px] font-semibold uppercase tracking-[0.13em] text-muted-foreground">
              Product
            </div>
            <ul className="space-y-2 text-[13px]">
              <li><a href="#product" className="hover:text-foreground">Feature tour</a></li>
              <li><a href="#capabilities" className="hover:text-foreground">All 22 views</a></li>
              <li><a href="#read-only" className="hover:text-foreground">Read-only guarantee</a></li>
              <li><a href="#faq" className="hover:text-foreground">FAQ</a></li>
              <li><a href="#sign-in" className="hover:text-foreground">Connect</a></li>
            </ul>
          </div>
          <div>
            <div className="mb-3 text-[10.5px] font-semibold uppercase tracking-[0.13em] text-muted-foreground">
              Made by
            </div>
            <p className="text-[13.5px] font-semibold">Arunim's IT Caffe</p>
            <p className="mt-1 max-w-xs text-[12.5px] leading-relaxed text-muted-foreground">
              Independent tooling for cloud operators.
            </p>
            <a
              href="#family"
              className="mt-3 inline-flex items-center gap-1.5 text-[12.5px] font-medium hover:text-foreground"
            >
              <ArrowRight className="h-3.5 w-3.5" />
              See all our products
            </a>
          </div>
        </div>
        <div className="mt-10 flex flex-col gap-2 border-t pt-6 text-[11.5px] text-muted-foreground md:flex-row md:items-center md:justify-between">
          <div>
            © {new Date().getFullYear()} {BRAND.name}. {BRAND.attribution}.
          </div>
          <div className="flex items-center gap-1.5">
            <ShieldCheck className="h-3.5 w-3.5" />
            Read-only by construction · no server database, no Azure resources.
          </div>
        </div>
      </div>
    </footer>
  );
}

/* -----------------------------------------------------------
 * Shared section header
 * -----------------------------------------------------------*/

function SectionHead({
  eyebrow,
  title,
  subtitle,
}: {
  eyebrow: string;
  title: string;
  subtitle?: string;
}) {
  return (
    <div className="max-w-2xl">
      <div className="mb-4 text-[11.5px] font-semibold uppercase tracking-[0.13em] text-primary">
        {eyebrow}
      </div>
      <h2 className="font-display text-[38px] leading-[1.02] tracking-tight md:text-[48px]">
        {title}
      </h2>
      {subtitle && (
        <p className="mt-4 text-[15px] leading-relaxed text-muted-foreground">
          {subtitle}
        </p>
      )}
    </div>
  );
}
