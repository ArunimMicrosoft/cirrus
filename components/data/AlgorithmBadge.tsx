"use client";

import * as React from "react";
import { Sigma, ChevronDown, ShieldCheck } from "lucide-react";
import { getAlgorithms, type AlgorithmKey, type Algorithm } from "@/lib/algorithms";

/**
 * "What's powering this page" explainer for an intelligence page.
 *
 * Every card leads with plain English — a friendly name and what the technique
 * actually does — so a non-specialist understands it at a glance. Expanding a
 * card reveals why it matters plus the precise, auditable technique name for
 * the reader who wants to verify the maths.
 *
 * A trust signal: real, inspectable algorithms, no black-box AI. This is a
 * presentational component over static content — no data fetching, no writes.
 */
export function AlgorithmBadge({ keys }: { keys: AlgorithmKey[] }) {
  const algos = getAlgorithms(keys);
  if (algos.length === 0) return null;

  return (
    <section
      className="rounded-xl border bg-card/60 p-3 sm:p-4"
      aria-label="How this page works"
    >
      <div className="mb-3 flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.13em] text-muted-foreground">
          <Sigma className="h-3.5 w-3.5 text-primary" />
          How this page works
        </span>
        <span className="text-[12px] text-muted-foreground">
          — plain-English explanations of the maths behind every number.
        </span>
        <span className="ml-auto inline-flex items-center gap-1.5 rounded-full border border-success/30 bg-success/10 px-2 py-0.5 text-[10.5px] font-medium text-success">
          <ShieldCheck className="h-3 w-3" />
          No AI · read-only · auditable
        </span>
      </div>

      <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
        {algos.map((a) => (
          <AlgorithmCard key={a.name} algo={a} />
        ))}
      </div>
    </section>
  );
}

function AlgorithmCard({ algo }: { algo: Algorithm }) {
  const [open, setOpen] = React.useState(false);
  const detailId = React.useId();

  return (
    <div className="flex flex-col rounded-lg border bg-background/70 p-3 transition-colors hover:border-primary/40">
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-[13px] font-semibold leading-tight text-foreground">
          {algo.plainName}
        </h3>
        <span className="shrink-0 rounded border px-1.5 py-0.5 text-[9.5px] uppercase tracking-wider text-muted-foreground">
          {algo.field}
        </span>
      </div>

      <p className="mt-1.5 text-[12px] leading-relaxed text-muted-foreground">
        {algo.what}
      </p>

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls={detailId}
        className="mt-2 inline-flex items-center gap-1 self-start text-[11.5px] font-medium text-primary transition-colors hover:text-primary/80"
      >
        Why it matters
        <ChevronDown
          className={`h-3.5 w-3.5 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
        />
      </button>

      <div
        id={detailId}
        className={`grid transition-all duration-200 ease-out ${
          open ? "mt-2 grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
        }`}
      >
        <div className="overflow-hidden">
          <p className="text-[12px] leading-relaxed text-foreground/90">{algo.why}</p>
          <p className="mt-2 border-t pt-2 text-[10.5px] text-muted-foreground">
            <span className="font-medium text-foreground/70">Technique:</span>{" "}
            <span className="font-mono">{algo.name}</span> — an established,
            inspectable method. Runs entirely in your browser on data you can see.
          </p>
        </div>
      </div>
    </div>
  );
}
