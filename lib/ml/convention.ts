/**
 * Naming & tagging convention inference.
 *
 * Learns the tenant's *implicit* standards from the resources themselves,
 * then flags the outliers — instead of hardcoding a rule for every org.
 *
 * Naming: tokenises each resource name into a structural signature
 * (segments split on - / _, each classified as lower/UPPER/Digit/mixed),
 * mines the dominant signature, and flags names that don't conform.
 *
 * Tagging: frequent-itemset style — finds the tag KEYS that most resources
 * carry, establishes the "expected key set," and flags resources missing
 * keys the majority have.
 *
 * Pure functions over already-fetched inventory. No writes.
 */

export interface NamedResource {
  name: string;
  tags?: Record<string, string> | null;
}

/* ------------------------------------------------------------------
 * Naming convention
 * ------------------------------------------------------------------*/

function tokenClass(tok: string): string {
  if (/^\d+$/.test(tok)) return "N"; // numeric
  if (/^[a-z]+$/.test(tok)) return "l"; // lower
  if (/^[A-Z]+$/.test(tok)) return "U"; // upper
  if (/^[a-z0-9]+$/.test(tok)) return "a"; // alnum lower
  return "m"; // mixed/other
}

/** Structural signature, e.g. "l-l-N" for `web-prod-01`. */
export function nameSignature(name: string): string {
  const segs = name.split(/[-_]/).filter(Boolean);
  if (segs.length === 0) return "";
  return segs.map(tokenClass).join("-");
}

export interface NamingConvention {
  /** Dominant signature, e.g. "l-l-N". */
  dominant: string;
  /** Fraction of resources matching the dominant signature, 0..1. */
  coverage: number;
  /** A human-readable pattern hint, e.g. "<word>-<word>-<nn>". */
  patternHint: string;
  /** Names that violate the dominant signature. */
  violations: string[];
  /** How many distinct signatures exist (naming entropy proxy). */
  distinctSignatures: number;
}

function hintFromSignature(sig: string): string {
  return sig
    .split("-")
    .map((c) => {
      switch (c) {
        case "N":
          return "<nn>";
        case "l":
          return "<word>";
        case "U":
          return "<WORD>";
        case "a":
          return "<name>";
        default:
          return "<seg>";
      }
    })
    .join("-");
}

export function inferNamingConvention(resources: NamedResource[]): NamingConvention | null {
  const names = resources.map((r) => r.name).filter(Boolean);
  if (names.length < 5) return null;

  const counts = new Map<string, number>();
  for (const n of names) {
    const sig = nameSignature(n);
    if (sig) counts.set(sig, (counts.get(sig) ?? 0) + 1);
  }
  if (counts.size === 0) return null;

  let dominant = "";
  let max = 0;
  for (const [sig, c] of counts) {
    if (c > max) {
      max = c;
      dominant = sig;
    }
  }
  const coverage = max / names.length;
  const violations = names.filter((n) => nameSignature(n) !== dominant);

  return {
    dominant,
    coverage,
    patternHint: hintFromSignature(dominant),
    violations,
    distinctSignatures: counts.size,
  };
}

/* ------------------------------------------------------------------
 * Tagging convention
 * ------------------------------------------------------------------*/

export interface TaggingConvention {
  /** Tag keys the majority of resources carry, with prevalence 0..1. */
  expectedKeys: Array<{ key: string; prevalence: number }>;
  /** Resources missing one or more expected keys. */
  violations: Array<{ name: string; missing: string[] }>;
  /** Fraction of resources fully compliant with the expected key set. */
  compliance: number;
}

/**
 * Infer the expected tag key set: any key present on >= `threshold` of
 * resources is considered part of the convention. Resources missing those
 * keys are flagged.
 */
export function inferTaggingConvention(
  resources: NamedResource[],
  threshold = 0.6,
): TaggingConvention | null {
  if (resources.length < 5) return null;

  const keyCounts = new Map<string, number>();
  for (const r of resources) {
    for (const k of Object.keys(r.tags ?? {})) {
      keyCounts.set(k, (keyCounts.get(k) ?? 0) + 1);
    }
  }
  const expectedKeys = [...keyCounts.entries()]
    .map(([key, c]) => ({ key, prevalence: c / resources.length }))
    .filter((e) => e.prevalence >= threshold)
    .sort((a, b) => b.prevalence - a.prevalence);

  if (expectedKeys.length === 0) {
    return { expectedKeys: [], violations: [], compliance: 0 };
  }

  const expectedSet = expectedKeys.map((e) => e.key);
  const violations: TaggingConvention["violations"] = [];
  let compliant = 0;
  for (const r of resources) {
    const have = new Set(Object.keys(r.tags ?? {}));
    const missing = expectedSet.filter((k) => !have.has(k));
    if (missing.length === 0) compliant++;
    else violations.push({ name: r.name, missing });
  }

  return {
    expectedKeys,
    violations,
    compliance: compliant / resources.length,
  };
}
