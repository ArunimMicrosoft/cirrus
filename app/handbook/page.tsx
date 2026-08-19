"use client";

import Link from "next/link";
import { ArrowUpRight, ShieldCheck } from "lucide-react";
import {
  TopNav,
  Footer,
} from "@/components/landing/sections";
import { HandbookTOC, type TocSection } from "@/components/landing/HandbookTOC";
import { BRAND } from "@/lib/brand";
import { getAlgorithms } from "@/lib/algorithms";

/**
 * /handbook — a single long-form document a CISO or security reviewer can
 * read cover-to-cover before approving Meridian for their tenant. Covers
 * how the app works end-to-end, the security model, the data flow, and
 * an audit checklist.
 */

const SECTIONS: TocSection[] = [
  { id: "intro", title: "What Meridian is" },
  { id: "who", title: "Who it is for" },
  { id: "signin", title: "How you sign in" },
  { id: "filemode", title: "Analyze from a file (no tenant)" },
  { id: "click", title: "What happens when you click" },
  { id: "guarantee", title: "The read-only guarantee" },
  { id: "data", title: "Where every piece of data lives" },
  { id: "doesnt", title: "What Meridian does not do" },
  { id: "signals", title: "The intelligence signals" },
  { id: "arch", title: "Deployment architecture" },
  { id: "review", title: "Security review checklist" },
  { id: "faq", title: "Common concerns" },
];

export default function HandbookPage() {
  return (
    <div className="relative min-h-screen bg-background text-foreground">
      <TopNav />

      {/* Page hero */}
      <section className="relative overflow-hidden border-b border-border/60">
        <div className="cc-glow pointer-events-none absolute inset-0 opacity-40" aria-hidden />
        <div className="relative mx-auto max-w-6xl px-5 py-16 md:px-8 md:py-24">
          <div className="mb-6 flex flex-wrap items-center gap-x-6 gap-y-1 font-mono text-[10.5px] uppercase tracking-[0.14em] text-muted-foreground">
            <span className="inline-flex items-center gap-2 text-primary">
              <span className="relative inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-success live-dot" />
              The handbook
            </span>
            <span className="hidden md:inline">·</span>
            <span className="hidden md:inline">12 sections · full technical spec</span>
            <span className="ml-auto hidden font-mono normal-case md:inline">
              {BRAND.host}/handbook
            </span>
          </div>
          <div className="max-w-3xl">
            <h1 className="font-display text-[36px] leading-[1.02] tracking-tight md:text-[60px]">
              Every claim,
              <br className="hidden md:inline" />
              <span className="bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent">
                verifiable in the source.
              </span>
            </h1>
            <p className="mt-5 text-[15.5px] leading-relaxed text-muted-foreground md:text-[17px]">
              A walk-through of the product, the security model, and the data
              flow at every click. Written for engineers, security reviewers,
              MSPs, and the CISO signing the approval — anyone who needs to
              be satisfied that {BRAND.name} is safe to point at their Azure
              tenant.
            </p>
            <div className="mt-6 inline-flex items-center gap-2 rounded-md border bg-card/60 px-3 py-1.5 text-[11.5px] text-muted-foreground">
              <ShieldCheck className="h-3.5 w-3.5 text-success" />
              <span>Public source · no proprietary layer · read the code</span>
            </div>
          </div>
        </div>
      </section>

      {/* Body: TOC + long-form content */}
      <div className="mx-auto max-w-6xl px-5 py-16 md:px-8 md:py-20">
        <div className="grid gap-10 lg:grid-cols-[220px_minmax(0,1fr)] lg:gap-16">
          <aside className="top-20 hidden self-start lg:sticky lg:block">
            <HandbookTOC sections={SECTIONS} />
          </aside>

          <article className="min-w-0 space-y-16">
            <IntroSection />
            <WhoSection />
            <SignInSection />
            <FileModeHandbookSection />
            <ClickSection />
            <GuaranteeSection />
            <DataSection />
            <DoesntSection />
            <SignalsSection />
            <ArchSection />
            <ReviewSection />
            <FaqSection />
          </article>
        </div>
      </div>

      <Footer />
    </div>
  );
}

/* -----------------------------------------------------------
 * Section primitives
 * -----------------------------------------------------------*/

function SectionTitle({ id, eyebrow, title }: { id: string; eyebrow: string; title: string }) {
  return (
    <header className="border-b border-primary/20 pb-4">
      <div className="font-mono text-[10.5px] font-semibold uppercase tracking-[0.14em] text-primary">
        {eyebrow}
      </div>
      <h2 id={id} className="mt-2 scroll-mt-24 font-display text-[26px] leading-tight tracking-tight md:text-[32px]">
        {title}
      </h2>
    </header>
  );
}

function P({ children }: { children: React.ReactNode }) {
  return <p className="text-[14.5px] leading-relaxed text-muted-foreground">{children}</p>;
}

function Strong({ children }: { children: React.ReactNode }) {
  return <strong className="font-semibold text-foreground">{children}</strong>;
}

function Callout({ tone = "default", children }: { tone?: "default" | "success" | "warning"; children: React.ReactNode }) {
  const toneClass =
    tone === "success"
      ? "border-success/40 bg-success/5"
      : tone === "warning"
        ? "border-warning/40 bg-warning/5"
        : "border-border bg-card/60";
  return (
    <div className={`rounded-md border p-4 text-[13.5px] leading-relaxed ${toneClass}`}>
      {children}
    </div>
  );
}

function CodeBlock({ children }: { children: string }) {
  return (
    <pre className="overflow-x-auto rounded-md border bg-card p-4 font-mono text-[12px] leading-relaxed">
      <code>{children}</code>
    </pre>
  );
}

/* -----------------------------------------------------------
 * Sections
 * -----------------------------------------------------------*/

function IntroSection() {
  return (
    <section className="space-y-5">
      <SectionTitle id="intro" eyebrow="01 · Introduction" title="What Meridian is" />
      <P>
        <Strong>Meridian</Strong> is a read-only visibility layer for your
        Azure estate. Sign in once, pick a subscription, and every inventory,
        cost, security, networking, monitoring, and change-tracking view is
        available under one shell. Every piece of data you see is fetched
        live from Azure the moment you land on the page — nothing is
        pre-crawled, nothing is stored on our side, nothing goes stale.
      </P>
      <P>
        The word that matters most in that first sentence is{" "}
        <Strong>read-only</Strong>. Meridian does not have the technical
        ability to create, modify, or delete Azure resources. This is not a
        policy we enforce with review or hope — it is enforced by the
        code, and the enforcement is auditable in a few small files. The
        rest of this document explains exactly how.
      </P>
      <P>
        Meridian is a static single-page app with a small set of stateless
        server-side functions. It carries no database, no queue, no analytics
        pipeline, no telemetry SDK, and no server-side storage of your Azure
        data. When you close the tab, the only thing left is the anonymous
        request log any hosting platform keeps for operational purposes.
      </P>
    </section>
  );
}

function WhoSection() {
  return (
    <section className="space-y-5">
      <SectionTitle id="who" eyebrow="02 · Audience" title="Who Meridian is for" />
      <P>Meridian is built for three overlapping audiences:</P>
      <ul className="space-y-3 text-[14.5px] leading-relaxed text-muted-foreground">
        <li className="border-l border-primary/50 pl-4">
          <Strong>Cloud operators</Strong> who spend half their day in the
          Azure Portal clicking through blades to check status, spend, and
          drift. Meridian collapses those clicks into one shell.
        </li>
        <li className="border-l border-primary/50 pl-4">
          <Strong>Managed service providers</Strong> (MSPs) who manage
          multiple customer tenants. Meridian supports Azure Lighthouse and
          walks the full delegated-subscription list; every subscription is
          marked HOME or delegated.
        </li>
        <li className="border-l border-primary/50 pl-4">
          <Strong>Security and audit teams</Strong> who need a read-only,
          auditable view of security posture — CIS control status, orphaned
          resources, drift since last review, WAF review, blast radius —
          without granting anyone Contributor-or-higher rights.
        </li>
      </ul>
      <P>
        None of these audiences needs to install anything in their Azure.
        The only Azure-side prerequisite is the <Strong>Reader</Strong> role
        on each subscription being inspected.
      </P>
    </section>
  );
}

function SignInSection() {
  return (
    <section className="space-y-5">
      <SectionTitle id="signin" eyebrow="03 · Sign-in" title="How you sign in" />
      <P>Meridian offers two ways to authenticate. Both are read-only.</P>
      <div className="space-y-4">
        <Callout>
          <div className="mb-2 font-semibold text-foreground">
            Option A — Sign in with your Azure AD account
          </div>
          <P>
            You authenticate through Microsoft's own device-code sign-in
            page (microsoft.com/devicelogin) using your normal Azure AD
            credentials. Meridian receives a delegated access token that
            can only do what <em>you</em> personally can do in Azure — no
            more, no less. If you have Reader on a subscription, Meridian
            can read it. If you don't, Meridian can't. Your MFA and
            Conditional Access policies apply as usual.
          </P>
        </Callout>
        <Callout>
          <div className="mb-2 font-semibold text-foreground">
            Option B — Bring a Service Principal
          </div>
          <P>
            If your team already uses Service Principals for tooling,
            paste in the tenant, client ID, and client secret. Meridian
            uses the OAuth 2.0 client-credentials flow to mint an ARM
            token. The Service Principal only needs the Reader role.
          </P>
        </Callout>
      </div>
      <P>
        Whichever method you pick, the credentials that reach Meridian's
        backend are stored inside an encrypted HttpOnly cookie set on your
        browser and never persisted anywhere else. The plaintext values
        never touch a log line, a database, or a filesystem.
      </P>
      <div className="text-[12.5px] leading-relaxed">
        <Link
          href="/#sign-in"
          className="inline-flex items-center gap-1 font-medium text-primary hover:underline"
        >
          See the sign-in form
          <ArrowUpRight className="h-3.5 w-3.5" />
        </Link>
      </div>
    </section>
  );
}

function FileModeHandbookSection() {
  return (
    <section className="space-y-5">
      <SectionTitle id="filemode" eyebrow="04 · File mode" title="Analyze from a file (no tenant access)" />
      <P>
        Not every team can grant even read-only access on day one. For those
        cases Meridian has <Strong>File mode</Strong>: upload an exported ARM
        template or a Terraform state file and the same network and
        configuration analysis runs against it — no Azure connection, no
        credentials.
      </P>
      <Callout tone="success">
        <div className="mb-1 font-semibold text-foreground">Parsed entirely in your browser</div>
        The file is read and analyzed client-side. It is never uploaded to any
        server, and File mode needs no Azure credentials at all. The parsed
        result lives only in your browser tab and clears when you leave.
      </Callout>
      <P>Supported inputs:</P>
      <ul className="space-y-2 text-[14.5px] leading-relaxed text-muted-foreground">
        <li className="border-l border-border pl-4">
          <Strong>Terraform state</Strong> — a{" "}
          <code className="rounded bg-muted px-1 py-0.5 text-[12px]">.tfstate</code> file or{" "}
          <code className="rounded bg-muted px-1 py-0.5 text-[12px]">terraform show -json</code>{" "}
          output. Most accurate, because state holds fully-resolved values and
          real resource IDs.
        </li>
        <li className="border-l border-border pl-4">
          <Strong>Azure ARM JSON</Strong> — an{" "}
          <code className="rounded bg-muted px-1 py-0.5 text-[12px]">az resource list</code>{" "}
          export, an ARM REST list, an exported template, or a single resource.
        </li>
      </ul>
      <P>
        For deployment templates, Meridian evaluates the ARM expression
        language — <code className="rounded bg-muted px-1 py-0.5 text-[12px]">parameters()</code>,{" "}
        <code className="rounded bg-muted px-1 py-0.5 text-[12px]">variables()</code>,{" "}
        <code className="rounded bg-muted px-1 py-0.5 text-[12px]">concat()</code>,{" "}
        <code className="rounded bg-muted px-1 py-0.5 text-[12px]">resourceId()</code> and friends —
        so resource names and references resolve instead of showing raw{" "}
        <code className="rounded bg-muted px-1 py-0.5 text-[12px]">[parameters(&apos;…&apos;)]</code>{" "}
        strings.
      </P>
      <Callout tone="success">
        <div className="mb-1 font-semibold text-foreground">Works from a file</div>
        Network topology and subnet reachability, segmentation score, VNet
        peering, route analysis, NSG rules, public exposure, IPAM, and core
        inventory (VMs, storage, SQL, Key Vault, public IPs, app gateways) —
        everything that is declared configuration.
      </Callout>
      <Callout tone="warning">
        <div className="mb-1 font-semibold text-foreground">Needs a live connection</div>
        Cost, right-sizing, metrics, and anomaly signals depend on billing and
        telemetry that isn&apos;t present in an infrastructure file, so those
        views are clearly disabled in File mode rather than shown with empty or
        invented numbers.
      </Callout>
      <P>
        Throughout File mode a persistent banner marks the data as file-based —
        naming the file and stamping the &ldquo;as of&rdquo; time — so it is
        never mistaken for a live tenant view.
      </P>
    </section>
  );
}

function ClickSection() {
  return (
    <section className="space-y-5">
      <SectionTitle id="click" eyebrow="05 · Data flow" title="What happens when you click a view" />
      <P>
        When you open any inventory or cost view — say, Virtual Machines —
        the request flow is:
      </P>
      <ol className="space-y-3 text-[14.5px] leading-relaxed text-muted-foreground">
        <li className="border-l border-border pl-4">
          <Strong>1. Browser → Meridian backend.</Strong> Your browser
          makes a request to <code className="rounded bg-muted px-1 py-0.5 text-[12px]">/api/arm/&lt;subscription&gt;/&lt;path&gt;</code>.
          The session cookie is attached so the server can identify the
          signed-in user.
        </li>
        <li className="border-l border-border pl-4">
          <Strong>2. Cookie decrypt.</Strong> The Function decrypts the
          cookie in-memory (AES-GCM, 256-bit key). It reads either the
          Service Principal credentials or the refresh token, then discards
          them from memory after the response returns.
        </li>
        <li className="border-l border-border pl-4">
          <Strong>3. Token acquisition.</Strong> The function calls Azure
          AD to mint (or refresh) an ARM access token. Tokens are cached in
          a short-lived edge cache for their natural lifetime (~1 hour) so
          we don&apos;t hammer Azure AD.
        </li>
        <li className="border-l border-border pl-4">
          <Strong>4. Read-only ARM proxy.</Strong> The Function rejects
          any request with a non-GET verb before it leaves the server.
          For allowed requests, it forwards a GET to{" "}
          <code className="rounded bg-muted px-1 py-0.5 text-[12px]">management.azure.com</code>{" "}
          with the freshly minted token.
        </li>
        <li className="border-l border-border pl-4">
          <Strong>5. Response → browser.</Strong> The ARM response is
          streamed back to your browser as JSON. No copy is retained on
          our side.
        </li>
      </ol>
      <P>
        The only outbound requests Meridian ever makes are to:
      </P>
      <ul className="space-y-2 text-[14.5px] leading-relaxed text-muted-foreground">
        <li className="pl-4">
          — <code className="rounded bg-muted px-1 py-0.5 text-[12px]">login.microsoftonline.com</code> (Azure AD token endpoints)
        </li>
        <li className="pl-4">
          — <code className="rounded bg-muted px-1 py-0.5 text-[12px]">management.azure.com</code> (Azure Resource Manager)
        </li>
        <li className="pl-4">
          — <code className="rounded bg-muted px-1 py-0.5 text-[12px]">prices.azure.com</code> (Microsoft's public Retail Prices API — no auth, no data sent)
        </li>
      </ul>
      <P>
        There is no third-party analytics, no telemetry endpoint, no CDN
        script from an unrelated vendor. Every outbound host is a Microsoft
        property.
      </P>
    </section>
  );
}

function GuaranteeSection() {
  return (
    <section className="space-y-5">
      <SectionTitle id="guarantee" eyebrow="06 · Security" title="The read-only guarantee — four layers" />
      <P>
        The core promise is that Meridian cannot mutate your Azure. That
        promise rests on four independent defensive layers. All four must
        fail simultaneously for a write to happen — and by construction,
        the second and third layers are impossible to bypass at all.
      </P>
      <div className="space-y-4">
        <Callout>
          <div className="mb-1 font-semibold text-foreground">Layer 1 — The ARM proxy is GET-only</div>
          <P>
            Every call to Azure Resource Manager goes through a single
            server-side proxy function. That function begins with a hard
            check: any HTTP verb other than GET returns 405 Method Not
            Allowed before the token is ever attached. Since every ARM
            write operation requires POST, PUT, PATCH, or DELETE (per
            Azure's contract), no request that would mutate can ever leave
            our proxy.
          </P>
        </Callout>
        <Callout>
          <div className="mb-1 font-semibold text-foreground">Layer 2 — Resource Graph is query-only by design</div>
          <P>
            Cross-subscription searches use Azure Resource Graph. Its
            underlying query language (Kusto / KQL) has <em>no</em> write
            primitives: no INSERT, no UPDATE, no DELETE. Microsoft's own
            documentation states this as an invariant. Even the Resource
            Graph endpoint URL is a query endpoint — there is no companion
            "write" API.
          </P>
        </Callout>
        <Callout>
          <div className="mb-1 font-semibold text-foreground">Layer 3 — No write client exists in the codebase</div>
          <P>
            The Azure SDK packages that could perform write operations
            (@azure/arm-compute, @azure/arm-storage, etc.) are not
            imported anywhere. Every ARM call in the codebase is a raw{" "}
            <code className="rounded bg-muted px-1 py-0.5 text-[12px]">fetch()</code>{" "}
            through the GET-only proxy. If a future contributor added a
            write SDK, the diff would be immediately visible and could be
            rejected in code review.
          </P>
        </Callout>
        <Callout>
          <div className="mb-1 font-semibold text-foreground">Layer 4 — All persistence is browser-local</div>
          <P>
            Drift snapshots, anomaly baselines, and your active-subscription
            selection all live in the browser's IndexedDB and localStorage.
            Deleting a snapshot removes an IndexedDB row on your device —
            Azure is untouched. There is no server copy to leak, corrupt,
            or exfiltrate, because there is no server copy.
          </P>
        </Callout>
      </div>
    </section>
  );
}

function DataSection() {
  return (
    <section className="space-y-5">
      <SectionTitle id="data" eyebrow="07 · Data map" title="Where every piece of data lives" />
      <P>
        A full audit of what is stored where, for how long, and how it is
        protected. There is no other state.
      </P>
      <div className="overflow-x-auto rounded-md border">
        <table className="w-full min-w-[640px] text-[13px]">
          <thead className="border-b bg-muted/50 text-[11px] uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-3 py-2 text-left font-semibold">Data</th>
              <th className="px-3 py-2 text-left font-semibold">Location</th>
              <th className="px-3 py-2 text-left font-semibold">Lifetime</th>
              <th className="px-3 py-2 text-left font-semibold">Protection</th>
            </tr>
          </thead>
          <tbody className="[&_tr]:border-b [&_tr:last-child]:border-0">
            <tr>
              <td className="px-3 py-2 font-medium">Service Principal secret / refresh token</td>
              <td className="px-3 py-2 text-muted-foreground">Encrypted HttpOnly cookie (browser)</td>
              <td className="px-3 py-2 text-muted-foreground">4 hours</td>
              <td className="px-3 py-2 text-muted-foreground">AES-GCM 256-bit; HttpOnly, Secure, SameSite=Lax; revocable via SESSION_EPOCH</td>
            </tr>
            <tr>
              <td className="px-3 py-2 font-medium">Active subscription</td>
              <td className="px-3 py-2 text-muted-foreground">Browser localStorage</td>
              <td className="px-3 py-2 text-muted-foreground">Until you log out</td>
              <td className="px-3 py-2 text-muted-foreground">Same-origin isolation</td>
            </tr>
            <tr>
              <td className="px-3 py-2 font-medium">Azure AD access token</td>
              <td className="px-3 py-2 text-muted-foreground">Short-lived edge cache</td>
              <td className="px-3 py-2 text-muted-foreground">~1 hour (token natural expiry)</td>
              <td className="px-3 py-2 text-muted-foreground">Keyed by SHA-256 of credentials; not exposed via API</td>
            </tr>
            <tr>
              <td className="px-3 py-2 font-medium">VM retail prices</td>
              <td className="px-3 py-2 text-muted-foreground">Short-lived edge cache</td>
              <td className="px-3 py-2 text-muted-foreground">24 hours</td>
              <td className="px-3 py-2 text-muted-foreground">Non-sensitive public data</td>
            </tr>
            <tr>
              <td className="px-3 py-2 font-medium">Drift snapshots</td>
              <td className="px-3 py-2 text-muted-foreground">Browser IndexedDB (your device)</td>
              <td className="px-3 py-2 text-muted-foreground">Until you clear site data</td>
              <td className="px-3 py-2 text-muted-foreground">Per-user, per-device; never sent to a server</td>
            </tr>
            <tr>
              <td className="px-3 py-2 font-medium">Anomaly baselines (rollup counts)</td>
              <td className="px-3 py-2 text-muted-foreground">Browser IndexedDB (your device)</td>
              <td className="px-3 py-2 text-muted-foreground">60 days (auto-pruned)</td>
              <td className="px-3 py-2 text-muted-foreground">Per-user, per-device; never sent to a server</td>
            </tr>
            <tr>
              <td className="px-3 py-2 font-medium">Your Azure resource data</td>
              <td className="px-3 py-2 text-muted-foreground">Only in your browser's RAM, while the page is open</td>
              <td className="px-3 py-2 text-muted-foreground">Discarded on tab close</td>
              <td className="px-3 py-2 text-muted-foreground">Never persisted, never sent to a third party</td>
            </tr>
          </tbody>
        </table>
      </div>
      <Callout tone="success">
        <div className="mb-1 font-semibold text-foreground">The bottom line</div>
        There is <Strong>no</Strong> server-side database of any kind — no
        object store, no cache of your estate, no analytics warehouse.
        A copy of your Azure data that never exists is a copy that cannot
        leak, be subpoenaed, drift out of policy, or answer awkward
        data-residency questions. Meridian&apos;s smallest surface is the
        biggest security feature it has.
      </Callout>
    </section>
  );
}

function DoesntSection() {
  return (
    <section className="space-y-5">
      <SectionTitle id="doesnt" eyebrow="08 · Boundaries" title="What Meridian does not do" />
      <P>
        Explicit boundaries make the app easier to reason about. Meridian
        deliberately does not:
      </P>
      <ul className="space-y-3 text-[14.5px] leading-relaxed text-muted-foreground">
        <li className="border-l border-border pl-4">
          <Strong>Write to Azure.</Strong> No creates, no updates, no
          deletes, no policy assignments, no role assignments. See{" "}
          <a href="#guarantee" className="text-primary hover:underline">the four-layer guarantee</a>.
        </li>
        <li className="border-l border-border pl-4">
          <Strong>Ship third-party analytics.</Strong> No Google Analytics,
          no Segment, no PostHog, no LinkedIn pixel, no Facebook tag. The
          only network destinations are Microsoft's identity and management
          endpoints.
        </li>
        <li className="border-l border-border pl-4">
          <Strong>Retain your data on our servers.</Strong> Snapshots and
          baselines live in your browser. Prices and tokens cached at the
          edge are anonymous and short-lived. Nothing about your estate
          is retained past the moment you close the tab.
        </li>
        <li className="border-l border-border pl-4">
          <Strong>Aggregate customer data.</Strong> There is no shared
          training set, no cross-tenant model, no leaderboard. Your
          numbers are yours alone.
        </li>
        <li className="border-l border-border pl-4">
          <Strong>Call an LLM or external AI service by default.</Strong>{" "}
          The intelligence signals (right-sizing verdict, drift risk,
          anomaly detection) are pure rule-based and statistical
          classifiers running in your browser. No inference is farmed
          out.
        </li>
        <li className="border-l border-border pl-4">
          <Strong>Require an agent in your environment.</Strong> Nothing
          to install in Azure. Nothing to install on a bastion. Nothing
          running as a scheduled task.
        </li>
      </ul>
    </section>
  );
}

function SignalsSection() {
  return (
    <section className="space-y-5">
      <SectionTitle id="signals" eyebrow="09 · Intelligence" title="How the intelligence signals work" />
      <P>
        Three signals turn raw inventory into "here is what to act on."
        All three run entirely in your browser against data Meridian has
        already fetched. None involves a third-party service or a machine
        learning model over the network.
      </P>
      <Callout>
        <div className="mb-1 font-semibold text-foreground">Right-sizing verdict</div>
        <P>
          For every VM Azure Advisor recommends resizing, Meridian fetches
          the last 30 days of CPU metrics from Azure Monitor. A pure JS
          classifier grades the recommendation as high, medium, or low
          confidence based on p95, max, and busy-ratio thresholds. Trusted
          savings only include the high and medium items. Low-confidence
          recommendations — the ones where the metrics contradict Advisor
          — are struck through in the total.
        </P>
      </Callout>
      <Callout>
        <div className="mb-1 font-semibold text-foreground">Drift risk</div>
        <P>
          Every change in a drift diff is scored RISKY, NOTABLE, or benign
          by a rules table. Storage suddenly public? RISKY. NSG opened to
          the Internet on a critical port? RISKY. Tag changed? benign. The
          rules are inspectable in the source and can be reviewed for
          your compliance baseline.
        </P>
      </Callout>
      <Callout>
        <div className="mb-1 font-semibold text-foreground">Anomaly detection</div>
        <P>
          Meridian silently records a daily rollup of ~14 subscription
          metrics (VM count, orphan waste, risky NSG rules, storage that
          allows public access, etc.) into your browser's local storage. On
          subsequent loads, today's numbers are compared to the median of
          the last week's rollups and deviations are flagged. Because the
          baseline is per-device, no data ever leaves your machine.
        </P>
      </Callout>

      <P>
        No black box, no LLM guesswork — just proven techniques turned into
        answers your team can act on. Here is what that looks like in practice:
      </P>
      <div className="grid gap-3 sm:grid-cols-2">
        {getAlgorithms([
          "costForecast",
          "dijkstra",
          "distributionSizing",
          "cusum",
          "segmentationScore",
          "riOptimizer",
        ]).map((a) => (
          <div key={a.name} className="rounded-md border bg-card/60 p-4">
            <div className="font-display text-[15px] tracking-tight text-foreground">
              {a.plainName}
            </div>
            <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">
              {a.why}
            </p>
          </div>
        ))}
      </div>
      <Callout tone="success">
        <div className="mb-1 font-semibold text-foreground">Real math you can trust</div>
        Every signal is a named, established technique that runs right in your
        browser on data already fetched — nothing leaves your tenant, and the
        exact method behind each view is named where you use it. No mystery
        scores, no vendor model, no data pooled across customers.
      </Callout>
    </section>
  );
}

function ArchSection() {
  return (
    <section className="space-y-5">
      <SectionTitle id="arch" eyebrow="10 · Architecture" title="Deployment architecture" />
      <P>
        A static single-page app plus a small set of stateless serverless
        functions on a managed edge platform — no always-on server, no VM or
        operating system to patch, and all traffic HTTPS end-to-end. That is
        the entire footprint.
      </P>
    </section>
  );
}

function ReviewSection() {
  return (
    <section className="space-y-5">
      <SectionTitle id="review" eyebrow="11 · Audit checklist" title="Security review checklist for your CISO" />
      <P>
        A one-page summary a security reviewer can use to sign off on
        Meridian. Each question links to the section that answers it.
      </P>
      <div className="space-y-3">
        <ReviewItem
          q="Can this app modify our Azure resources?"
          a="No. Four independent layers make writes architecturally impossible."
          link="#guarantee"
        />
        <ReviewItem
          q="What Azure permissions does it require?"
          a="Reader role on each subscription. Nothing higher, nothing broader."
          link="#signin"
        />
        <ReviewItem
          q="Where do our credentials live?"
          a="Encrypted with AES-GCM in an HttpOnly cookie on the user's browser. Never in logs, never in a database, never in a filesystem."
          link="#data"
        />
        <ReviewItem
          q="What data leaves our tenant?"
          a="Only Azure Resource Manager responses, and only to render the page the user is viewing. Nothing is retained on our side."
          link="#click"
        />
        <ReviewItem
          q="Are there third-party trackers, analytics, or telemetry?"
          a="No. Every outbound host is a Microsoft property (login.microsoftonline.com, management.azure.com, prices.azure.com)."
          link="#click"
        />
        <ReviewItem
          q="How is the session invalidated?"
          a="Cookies expire after 8 hours automatically, or immediately when the user clicks Logout."
          link="#data"
        />
        <ReviewItem
          q="How is source code auditable?"
          a="The full source lives in a public Git repository. Every claim in this handbook can be verified by reading the code."
          link="#arch"
        />
        <ReviewItem
          q="What happens if we tear this down?"
          a="Delete the deployment. No Azure resource, no server-side data, and no external dependency remains."
          link="#arch"
        />
      </div>
    </section>
  );
}

function ReviewItem({
  q,
  a,
  link,
}: {
  q: string;
  a: string;
  link: string;
}) {
  return (
    <div className="rounded-md border bg-card/60 p-4">
      <div className="text-[14px] font-semibold text-foreground">{q}</div>
      <p className="mt-1 text-[13.5px] leading-relaxed text-muted-foreground">{a}</p>
      <a
        href={link}
        className="mt-2 inline-flex items-center gap-1 text-[11.5px] font-medium text-primary hover:underline"
      >
        See details
        <ArrowUpRight className="h-3 w-3" />
      </a>
    </div>
  );
}

function FaqSection() {
  const items: Array<{ q: string; a: string }> = [
    {
      q: "How does this differ from just using the Azure Portal?",
      a: "The Portal shows one blade at a time. Meridian aggregates 22 views under one shell, adds live-priced cost intelligence, cross-subscription rollups, drift snapshots, and three intelligence signals — all read-only, all in one place.",
    },
    {
      q: "Can we evaluate Meridian without giving it any Azure access?",
      a: "Yes — use File mode. Upload an exported ARM template or a Terraform state file (.tfstate / terraform show -json) and Meridian runs its network topology, subnet reachability, NSG/WAF and IPAM analysis entirely in your browser. Nothing is uploaded and no credentials are needed. Cost and metrics stay disabled because that data isn't in an infrastructure file.",
    },
    {
      q: "Is there a hosted SaaS version, or must we self-host?",
      a: `The public hosted version lives at ${BRAND.host}. You can also deploy your own private instance in a few minutes — it's a static app plus stateless functions, so it runs on any modern edge or serverless platform.`,
    },
    {
      q: "How is authentication rotated?",
      a: "Sessions expire after 4 hours regardless of activity. To sign everyone out on demand, bump the SESSION_EPOCH environment variable — every previously-issued cookie fails validation on the next request. As a nuclear option, rotating SESSION_SECRET invalidates sessions and rotates the encryption key at the same time.",
    },
    {
      q: "Can the app be air-gapped or run privately?",
      a: "Yes. The app is a static bundle plus stateless functions, both of which can be deployed to a private, internally-routed environment so only your users can reach it — provided the function environment can still reach the Azure endpoints it reads from.",
    },
    {
      q: "What if a developer accidentally introduces a write path?",
      a: "It would show up as a diff in code review. The ARM proxy's GET-only check is a single small function, easy to spot. Introducing a write-capable Azure SDK is also a visible dependency change reviewers can catch.",
    },
    {
      q: "What is the incident-response process if something goes wrong?",
      a: "Deployments are immutable and can be rolled back instantly from the hosting console. Because Meridian holds no server-side state, a rollback cannot corrupt any customer data. Revoking every session takes under a minute via the session controls.",
    },
  ];
  return (
    <section className="space-y-5">
      <SectionTitle id="faq" eyebrow="12 · FAQ" title="Common concerns, answered" />
      <dl className="space-y-2">
        {items.map((f) => (
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
            <p className="mt-3 text-[13.5px] leading-relaxed text-muted-foreground">
              {f.a}
            </p>
          </details>
        ))}
      </dl>
      <div className="pt-6">
        <Link
          href="/#sign-in"
          className="inline-flex items-center gap-1.5 rounded-md border border-primary/40 bg-primary/10 px-4 py-2 text-[13.5px] font-semibold text-primary hover:bg-primary/20"
        >
          Ready to try it — sign in
          <ArrowUpRight className="h-4 w-4" />
        </Link>
      </div>
    </section>
  );
}
