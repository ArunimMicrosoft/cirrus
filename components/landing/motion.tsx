"use client";

/**
 * Landing-page motion toolkit — dependency-free, accessibility-aware.
 *
 * Everything here is pure presentation: IntersectionObserver to trigger on
 * scroll, requestAnimationFrame for count-ups, CSS transitions for reveals and
 * bars. All of it honours `prefers-reduced-motion` (no motion → final state
 * shown immediately). No data, no network, no writes.
 */

import * as React from "react";
import { cn } from "@/lib/utils";

export function useReducedMotion(): boolean {
  const [reduced, setReduced] = React.useState(false);
  React.useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const onChange = () => setReduced(mq.matches);
    mq.addEventListener?.("change", onChange);
    return () => mq.removeEventListener?.("change", onChange);
  }, []);
  return reduced;
}

export function useInView<T extends HTMLElement>(
  once = true,
  rootMargin = "0px 0px -12% 0px",
): [React.RefObject<T>, boolean] {
  const ref = React.useRef<T>(null);
  const [inView, setInView] = React.useState(false);
  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") {
      setInView(true);
      return;
    }
    const obs = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            setInView(true);
            if (once) obs.disconnect();
          } else if (!once) {
            setInView(false);
          }
        }
      },
      { rootMargin, threshold: 0.15 },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [once, rootMargin]);
  return [ref, inView];
}

/** Fades + slides a block into view on scroll. Stagger via `delay` (ms). */
export function Reveal({
  children,
  delay = 0,
  className,
}: {
  children: React.ReactNode;
  delay?: number;
  className?: string;
}) {
  const [ref, inView] = useInView<HTMLDivElement>();
  return (
    <div
      ref={ref}
      className={cn("cc-reveal", inView && "is-in", className)}
      style={{ transitionDelay: `${delay}ms` }}
    >
      {children}
    </div>
  );
}

/** Animated number that counts up from 0 to `value` when scrolled into view. */
export function CountUp({
  value,
  decimals = 0,
  prefix = "",
  suffix = "",
  duration = 1300,
  className,
}: {
  value: number;
  decimals?: number;
  prefix?: string;
  suffix?: string;
  duration?: number;
  className?: string;
}) {
  const [ref, inView] = useInView<HTMLSpanElement>();
  const reduced = useReducedMotion();
  const [display, setDisplay] = React.useState(0);

  React.useEffect(() => {
    if (!inView) return;
    if (reduced || duration <= 0) {
      setDisplay(value);
      return;
    }
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3); // easeOutCubic
      setDisplay(value * eased);
      if (t < 1) raf = requestAnimationFrame(tick);
      else setDisplay(value);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [inView, value, duration, reduced]);

  const formatted = display.toLocaleString(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
  return (
    <span ref={ref} className={className}>
      {prefix}
      {formatted}
      {suffix}
    </span>
  );
}

/** Vertical bar that grows from 0 to `pct`% height when in view. */
export function GrowBar({
  pct,
  className,
  delay = 0,
}: {
  pct: number;
  className?: string;
  delay?: number;
}) {
  const [ref, inView] = useInView<HTMLDivElement>();
  const reduced = useReducedMotion();
  const shown = inView || reduced;
  return (
    <div
      ref={ref}
      className={className}
      style={{
        height: shown ? `${pct}%` : "0%",
        transition: reduced ? undefined : "height .9s cubic-bezier(.22,.61,.36,1)",
        transitionDelay: `${delay}ms`,
      }}
    />
  );
}

/** Horizontal bar that fills from 0 to `pct`% width when in view. */
export function FillBar({
  pct,
  className,
  delay = 0,
}: {
  pct: number;
  className?: string;
  delay?: number;
}) {
  const [ref, inView] = useInView<HTMLDivElement>();
  const reduced = useReducedMotion();
  const shown = inView || reduced;
  return (
    <div
      ref={ref}
      className={className}
      style={{
        width: shown ? `${pct}%` : "0%",
        transition: reduced ? undefined : "width 1s cubic-bezier(.22,.61,.36,1)",
        transitionDelay: `${delay}ms`,
      }}
    />
  );
}
