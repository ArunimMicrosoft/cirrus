"use client";

import Link from "next/link";
import { ArrowUpRight, BookOpen, ShieldCheck } from "lucide-react";
import {
  TopNav,
  ReadOnlyManifesto,
  Faq,
  Footer,
} from "@/components/landing/sections";
import { BRAND } from "@/lib/brand";

/**
 * /security — the read-only guarantee and the FAQ that skeptical buyers
 * scroll straight to. The Handbook (/handbook) is the long-form deep dive.
 */
export default function SecurityPage() {
  return (
    <div className="relative min-h-screen bg-background text-foreground">
      <TopNav />

      {/* Command Center hero */}
      <section className="relative overflow-hidden border-b border-border/60">
        <div className="cc-glow pointer-events-none absolute inset-0 opacity-40" aria-hidden />
        <div className="relative mx-auto max-w-6xl px-5 py-16 md:px-8 md:py-24">
          <div className="mb-6 flex flex-wrap items-center gap-x-6 gap-y-1 font-mono text-[10.5px] uppercase tracking-[0.14em] text-muted-foreground">
            <span className="inline-flex items-center gap-2 text-primary">
              <span className="relative inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-success live-dot" />
              Security
            </span>
            <span className="hidden md:inline">·</span>
            <span className="hidden md:inline">Read-only · enforced in code</span>
            <span className="ml-auto hidden font-mono normal-case md:inline">
              {BRAND.host}/security
            </span>
          </div>
          <div className="max-w-3xl">
            <h1 className="font-display text-[36px] leading-[1.02] tracking-tight md:text-[60px]">
              How we can promise
              <br className="hidden md:inline" />
              <span className="bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent">
                {BRAND.name} won&apos;t touch your Azure.
              </span>
            </h1>
            <p className="mt-5 max-w-2xl text-[15.5px] leading-relaxed text-muted-foreground md:text-[17px]">
              Not a policy or a checklist. Four defensive layers in code make
              mutation architecturally impossible. Read the layers, then read
              the source — every claim is verifiable.
            </p>
            <div className="mt-6 inline-flex items-center gap-2 rounded-md border bg-card/60 px-3 py-1.5 text-[11.5px] text-muted-foreground">
              <ShieldCheck className="h-3.5 w-3.5 text-success" />
              <span>Reader-only on Azure · no writes · no server-side data retention</span>
            </div>
          </div>
        </div>
      </section>

      <ReadOnlyManifesto />

      {/* Deep-dive callout to the handbook */}
      <section className="border-b border-border/60">
        <div className="mx-auto max-w-6xl px-5 py-16 md:px-8">
          <Link
            href="/handbook"
            className="group cc-panel flex flex-col gap-3 rounded-2xl p-6 transition-colors hover:bg-card/80 md:flex-row md:items-center md:justify-between md:p-8"
          >
            <div className="flex items-start gap-4">
              <div className="mt-1 flex h-11 w-11 shrink-0 items-center justify-center rounded-md border border-primary/40 bg-primary/10 text-primary">
                <BookOpen className="h-5 w-5" />
              </div>
              <div>
                <div className="font-mono text-[10.5px] font-semibold uppercase tracking-[0.14em] text-primary">
                  Deep dive
                </div>
                <div className="mt-1 font-display text-[22px] leading-tight tracking-tight md:text-[26px]">
                  The {BRAND.name} Handbook
                </div>
                <p className="mt-1.5 max-w-2xl text-[13.5px] leading-relaxed text-muted-foreground">
                  Eleven sections covering every architectural decision, every
                  piece of state, every outbound host, every layer of the
                  read-only guarantee. Written for the CISO signing the
                  approval.
                </p>
              </div>
            </div>
            <span className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-primary/40 bg-primary/10 px-3 py-2 text-[13px] font-semibold text-primary transition-colors group-hover:bg-primary/20">
              Read the handbook
              <ArrowUpRight className="h-4 w-4" />
            </span>
          </Link>
        </div>
      </section>

      <Faq />
      <Footer />
    </div>
  );
}
