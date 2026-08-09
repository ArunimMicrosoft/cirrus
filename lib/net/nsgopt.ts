/**
 * NSG rule-set optimisation.
 *
 * Beyond shadowed-rule detection (netgraph.ts), this finds housekeeping and
 * hygiene issues: overly-broad any→any allows, mergeable adjacent CIDR
 * ranges, unused NSGs (attached to nothing), NSGs with no custom rules,
 * duplicate rules, and rule-count headroom against Azure's per-NSG limit.
 *
 * Pure analysis over already-fetched NSGs. No writes.
 */

import { parseCidr, coalesce, type IpInterval } from "./cidr";

const AZURE_NSG_RULE_LIMIT = 1000;

export interface NsgRuleLite {
  name: string;
  priority: number;
  direction: "Inbound" | "Outbound";
  access: "Allow" | "Deny";
  protocol: string;
  sources: string[];
  destPorts: string[];
}

export interface NsgLite {
  id: string;
  name: string;
  rules: NsgRuleLite[];
  /** Count of NICs + subnets this NSG is attached to. */
  associations: number;
}

export type OptKind =
  | "unused"
  | "no-custom-rules"
  | "any-any-allow"
  | "mergeable"
  | "duplicate"
  | "near-limit"
  | "ok";

export interface OptFinding {
  nsg: string;
  kind: OptKind;
  severity: "warning" | "info" | "ok";
  detail: string;
}

function isAny(tokens: string[]): boolean {
  return tokens.some((t) => {
    const s = (t ?? "").trim().toLowerCase();
    return s === "*" || s === "0.0.0.0/0" || s === "any" || s === "internet";
  });
}

function ruleSignature(r: NsgRuleLite): string {
  return [
    r.direction,
    r.access,
    r.protocol.toLowerCase(),
    [...r.sources].sort().join(","),
    [...r.destPorts].sort().join(","),
  ].join("|");
}

export function optimiseNsgs(nsgs: NsgLite[]): OptFinding[] {
  const out: OptFinding[] = [];

  for (const nsg of nsgs) {
    if (nsg.associations === 0) {
      out.push({
        nsg: nsg.name,
        kind: "unused",
        severity: "warning",
        detail: "Attached to no NIC or subnet — dead resource, safe to remove.",
      });
      continue;
    }
    if (nsg.rules.length === 0) {
      out.push({
        nsg: nsg.name,
        kind: "no-custom-rules",
        severity: "info",
        detail: "No custom rules — relies entirely on Azure defaults.",
      });
      continue;
    }

    // Rule-count headroom.
    if (nsg.rules.length >= AZURE_NSG_RULE_LIMIT * 0.8) {
      out.push({
        nsg: nsg.name,
        kind: "near-limit",
        severity: "warning",
        detail: `${nsg.rules.length}/${AZURE_NSG_RULE_LIMIT} rules — approaching the Azure per-NSG limit.`,
      });
    }

    // any→any allow.
    for (const r of nsg.rules) {
      if (
        r.access === "Allow" &&
        isAny(r.sources) &&
        r.destPorts.some((p) => p === "*" || p === "0-65535")
      ) {
        out.push({
          nsg: nsg.name,
          kind: "any-any-allow",
          severity: "warning",
          detail: `Rule "${r.name}" allows any source to any port (${r.direction}). Tighten scope.`,
        });
      }
    }

    // Duplicates.
    const seen = new Map<string, string>();
    for (const r of nsg.rules) {
      const sig = ruleSignature(r);
      if (seen.has(sig)) {
        out.push({
          nsg: nsg.name,
          kind: "duplicate",
          severity: "info",
          detail: `Rule "${r.name}" duplicates "${seen.get(sig)}" (same match & action).`,
        });
      } else {
        seen.set(sig, r.name);
      }
    }

    // Mergeable adjacent CIDRs among same-action, same-port allow rules.
    const mergeGroups = new Map<string, IpInterval[]>();
    for (const r of nsg.rules) {
      const key = `${r.direction}|${r.access}|${r.protocol.toLowerCase()}|${[...r.destPorts].sort().join(",")}`;
      const ivs = r.sources.map((s) => parseCidr(s)).filter((x): x is IpInterval => x !== null);
      if (ivs.length) mergeGroups.set(key, [...(mergeGroups.get(key) ?? []), ...ivs]);
    }
    for (const [key, ivs] of mergeGroups) {
      if (ivs.length < 2) continue;
      const merged = coalesce(ivs);
      if (merged.length < ivs.length) {
        out.push({
          nsg: nsg.name,
          kind: "mergeable",
          severity: "info",
          detail: `${ivs.length} source ranges for "${key.split("|").slice(0, 2).join(" ")}" collapse into ${merged.length} — consolidate for clarity.`,
        });
      }
    }
  }

  return out;
}
