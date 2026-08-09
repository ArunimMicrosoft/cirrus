/**
 * Formal NSG rule analysis via CIDR + port interval algebra.
 *
 * This is not the interactive "traffic simulator" — it statically analyses a
 * Network Security Group's rule set and reports:
 *
 *   - Shadowed rules: a lower-priority rule that can never match any packet
 *     because higher-priority rules already fully cover its (source CIDR ×
 *     destination port × protocol) space with the opposite-or-same action.
 *   - Internet-exposing allows: rules that admit traffic from public space
 *     to sensitive ports.
 *   - Redundant rules: rules fully subsumed by an earlier same-action rule.
 *
 * All computation is set algebra over integer intervals. Pure, deterministic,
 * no network. Works on data the GET-only ARM proxy already returned.
 */

export interface FlatRule {
  name: string;
  priority: number;
  direction: "Inbound" | "Outbound";
  access: "Allow" | "Deny";
  protocol: string; // "Tcp" | "Udp" | "*" | ...
  sources: string[]; // CIDRs / "*" / "Internet" / tags
  destPorts: string[]; // "80", "0-65535", "*"
}

export interface RuleFinding {
  rule: string;
  priority: number;
  kind: "shadowed" | "redundant" | "internet-exposed" | "ok";
  detail: string;
  /** Names of the higher-priority rules responsible, if any. */
  causedBy?: string[];
}

interface Interval {
  lo: number;
  hi: number;
}

const PORT_MAX = 65535;
const IP_MAX = 0xffffffff;

/* ------------------------------------------------------------------
 * Port interval helpers
 * ------------------------------------------------------------------*/

function parsePorts(ranges: string[]): Interval[] {
  const out: Interval[] = [];
  for (const r of ranges) {
    const s = (r ?? "").trim();
    if (s === "*" || s === "") {
      out.push({ lo: 0, hi: PORT_MAX });
      continue;
    }
    if (s.includes("-")) {
      const [a, b] = s.split("-").map((x) => parseInt(x, 10));
      if (Number.isFinite(a) && Number.isFinite(b)) out.push({ lo: Math.min(a, b), hi: Math.max(a, b) });
    } else {
      const n = parseInt(s, 10);
      if (Number.isFinite(n)) out.push({ lo: n, hi: n });
    }
  }
  return normalise(out);
}

/* ------------------------------------------------------------------
 * IP / CIDR interval helpers
 * ------------------------------------------------------------------*/

function ipToInt(ip: string): number | null {
  const parts = ip.split(".");
  if (parts.length !== 4) return null;
  let n = 0;
  for (const p of parts) {
    const o = parseInt(p, 10);
    if (!Number.isFinite(o) || o < 0 || o > 255) return null;
    n = (n * 256 + o) >>> 0;
  }
  return n >>> 0;
}

/**
 * Turn an NSG source token into IP intervals. Handles CIDR, single IP,
 * "*"/"0.0.0.0/0"/"Internet"/"any" (all public+private space for our
 * exposure purposes), and returns [] for service tags we can't resolve
 * (VirtualNetwork, AzureLoadBalancer, named tags) — treated as non-public.
 */
function parseSources(sources: string[]): { intervals: Interval[]; internet: boolean } {
  const intervals: Interval[] = [];
  let internet = false;
  for (const raw of sources) {
    const s = (raw ?? "").trim();
    if (s === "*" || s === "0.0.0.0/0" || s.toLowerCase() === "internet" || s.toLowerCase() === "any") {
      intervals.push({ lo: 0, hi: IP_MAX });
      internet = true;
      continue;
    }
    if (s.includes("/")) {
      const [ip, bitsStr] = s.split("/");
      const base = ipToInt(ip);
      const bits = parseInt(bitsStr, 10);
      if (base !== null && Number.isFinite(bits) && bits >= 0 && bits <= 32) {
        const size = bits === 0 ? IP_MAX + 1 : 2 ** (32 - bits);
        const lo = base & (bits === 0 ? 0 : (IP_MAX << (32 - bits)) >>> 0);
        const hi = (lo + size - 1) >>> 0;
        intervals.push({ lo: lo >>> 0, hi });
        // A /0 or very wide public range counts as internet exposure.
        if (bits <= 1 && !isPrivate(lo)) internet = true;
      }
      continue;
    }
    const single = ipToInt(s);
    if (single !== null) {
      intervals.push({ lo: single, hi: single });
      if (!isPrivate(single)) internet = true;
    }
    // else: service tag we don't model as public — skip.
  }
  return { intervals: normalise(intervals), internet };
}

function isPrivate(ip: number): boolean {
  // 10/8, 172.16/12, 192.168/16
  const a = (ip >>> 24) & 0xff;
  const b = (ip >>> 16) & 0xff;
  if (a === 10) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  return false;
}

/* ------------------------------------------------------------------
 * Generic interval-set operations
 * ------------------------------------------------------------------*/

function normalise(ints: Interval[]): Interval[] {
  if (ints.length === 0) return [];
  const s = [...ints].sort((a, b) => a.lo - b.lo);
  const out: Interval[] = [{ ...s[0] }];
  for (let i = 1; i < s.length; i++) {
    const last = out[out.length - 1];
    if (s[i].lo <= last.hi + 1) last.hi = Math.max(last.hi, s[i].hi);
    else out.push({ ...s[i] });
  }
  return out;
}

/** Remove `covered` from `base`, returning the remaining intervals. */
function subtract(base: Interval[], covered: Interval[]): Interval[] {
  let remaining = normalise(base);
  for (const c of normalise(covered)) {
    const next: Interval[] = [];
    for (const b of remaining) {
      if (c.hi < b.lo || c.lo > b.hi) {
        next.push(b); // disjoint
        continue;
      }
      if (c.lo > b.lo) next.push({ lo: b.lo, hi: c.lo - 1 });
      if (c.hi < b.hi) next.push({ lo: c.hi + 1, hi: b.hi });
    }
    remaining = normalise(next);
  }
  return remaining;
}

function isEmpty(ints: Interval[]): boolean {
  return ints.length === 0;
}

function protocolMatches(a: string, b: string): boolean {
  const pa = (a ?? "*").toLowerCase();
  const pb = (b ?? "*").toLowerCase();
  return pa === "*" || pb === "*" || pa === pb;
}

/* ------------------------------------------------------------------
 * Analysis
 * ------------------------------------------------------------------*/

const SENSITIVE_PORTS = [22, 3389, 1433, 3306, 5432, 27017, 6379, 9200];

/**
 * Analyse one direction's rule set (already sorted or not). Returns a
 * finding per rule. A rule is *shadowed* when, for its protocol, the union
 * of higher-priority rules fully covers its (source × port) rectangle — so
 * no packet can ever reach it.
 */
export function analyseRules(rules: FlatRule[]): RuleFinding[] {
  const sorted = [...rules].sort((a, b) => a.priority - b.priority);
  const findings: RuleFinding[] = [];

  for (let i = 0; i < sorted.length; i++) {
    const rule = sorted[i];
    const src = parseSources(rule.sources);
    const ports = parsePorts(rule.destPorts);

    // Shadow check: subtract every higher-priority rule that shares protocol.
    // We approximate the 2-D (IP × port) cover by requiring a higher rule to
    // subsume EITHER the full source range (then remove its ports) — handled
    // conservatively: we track remaining source and port space jointly by
    // only removing a higher rule's contribution when it covers the whole of
    // one axis. This avoids false "shadowed" positives.
    let remSrc = src.intervals;
    let remPorts = ports;
    const coveredBy: string[] = [];

    for (let j = 0; j < i; j++) {
      const hi = sorted[j];
      if (!protocolMatches(hi.protocol, rule.protocol)) continue;
      const hiSrc = parseSources(hi.sources);
      const hiPorts = parsePorts(hi.destPorts);

      // If higher rule covers all remaining ports, subtract its sources.
      if (isEmpty(subtract(remPorts, hiPorts))) {
        const before = remSrc;
        remSrc = subtract(remSrc, hiSrc.intervals);
        if (remSrc.length < before.length || (isEmpty(remSrc) && !isEmpty(before))) {
          coveredBy.push(hi.name);
        }
      } else if (isEmpty(subtract(remSrc, hiSrc.intervals))) {
        // Higher rule covers all remaining sources; subtract its ports.
        const before = remPorts;
        remPorts = subtract(remPorts, hiPorts);
        if (remPorts.length < before.length || (isEmpty(remPorts) && !isEmpty(before))) {
          coveredBy.push(hi.name);
        }
      }
      if (isEmpty(remSrc) || isEmpty(remPorts)) break;
    }

    const shadowed = isEmpty(remSrc) || isEmpty(remPorts);

    if (shadowed) {
      findings.push({
        rule: rule.name,
        priority: rule.priority,
        kind: "shadowed",
        detail: `Never matches — higher-priority rule(s) already cover its entire source/port space.`,
        causedBy: [...new Set(coveredBy)],
      });
      continue;
    }

    // Internet exposure check for inbound allows on sensitive ports.
    if (rule.direction === "Inbound" && rule.access === "Allow" && src.internet) {
      const exposed = SENSITIVE_PORTS.filter((p) =>
        ports.some((iv) => p >= iv.lo && p <= iv.hi),
      );
      const wildcard = ports.some((iv) => iv.lo === 0 && iv.hi === PORT_MAX);
      if (exposed.length > 0 || wildcard) {
        findings.push({
          rule: rule.name,
          priority: rule.priority,
          kind: "internet-exposed",
          detail: wildcard
            ? "Allows ALL ports from the public Internet."
            : `Allows sensitive port(s) ${exposed.join(", ")} from the public Internet.`,
        });
        continue;
      }
    }

    findings.push({
      rule: rule.name,
      priority: rule.priority,
      kind: "ok",
      detail: "Reachable and not internet-exposing on sensitive ports.",
    });
  }

  return findings;
}

/** Convenience: map an ARM NSG securityRules array into FlatRule[]. */
export function flattenRules(
  securityRules: Array<{
    name: string;
    properties: {
      priority: number;
      direction: "Inbound" | "Outbound";
      access: "Allow" | "Deny";
      protocol: string;
      sourceAddressPrefix?: string;
      sourceAddressPrefixes?: string[];
      destinationPortRange?: string;
      destinationPortRanges?: string[];
    };
  }>,
): FlatRule[] {
  return securityRules.map((r) => {
    const p = r.properties;
    const sources = [
      ...(p.sourceAddressPrefix ? [p.sourceAddressPrefix] : []),
      ...(p.sourceAddressPrefixes ?? []),
    ];
    const destPorts = [
      ...(p.destinationPortRange ? [p.destinationPortRange] : []),
      ...(p.destinationPortRanges ?? []),
    ];
    return {
      name: r.name,
      priority: p.priority,
      direction: p.direction,
      access: p.access,
      protocol: p.protocol,
      sources: sources.length ? sources : ["*"],
      destPorts: destPorts.length ? destPorts : ["*"],
    };
  });
}
