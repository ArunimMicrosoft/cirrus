/**
 * Shared IPv4 CIDR / interval utilities for the networking algorithms.
 *
 * IPv4 addresses are treated as unsigned 32-bit integers and CIDR blocks as
 * closed integer intervals [lo, hi]. All functions are pure. No network.
 */

export const IP_MAX = 0xffffffff;

export interface IpInterval {
  lo: number;
  hi: number;
}

/** Parse a dotted-quad IPv4 to an unsigned int, or null if malformed. */
export function ipToInt(ip: string): number | null {
  const parts = ip.trim().split(".");
  if (parts.length !== 4) return null;
  let n = 0;
  for (const p of parts) {
    const o = Number(p);
    if (!Number.isInteger(o) || o < 0 || o > 255) return null;
    n = (n * 256 + o) >>> 0;
  }
  return n >>> 0;
}

/** Format an unsigned int back to dotted-quad. */
export function intToIp(n: number): string {
  return [
    (n >>> 24) & 0xff,
    (n >>> 16) & 0xff,
    (n >>> 8) & 0xff,
    n & 0xff,
  ].join(".");
}

/** Parse "10.0.0.0/24" into an interval, or null. Also accepts a bare IP (/32). */
export function parseCidr(cidr: string): IpInterval | null {
  const s = (cidr ?? "").trim();
  if (!s) return null;
  if (!s.includes("/")) {
    const ip = ipToInt(s);
    return ip === null ? null : { lo: ip, hi: ip };
  }
  const [ipStr, bitsStr] = s.split("/");
  const base = ipToInt(ipStr);
  const bits = Number(bitsStr);
  if (base === null || !Number.isInteger(bits) || bits < 0 || bits > 32) return null;
  if (bits === 0) return { lo: 0, hi: IP_MAX };
  const mask = (IP_MAX << (32 - bits)) >>> 0;
  const lo = (base & mask) >>> 0;
  const hi = (lo + 2 ** (32 - bits) - 1) >>> 0;
  return { lo, hi };
}

/** Number of addresses in a CIDR block (2^(32-bits)). */
export function cidrSize(cidr: string): number {
  const iv = parseCidr(cidr);
  return iv ? iv.hi - iv.lo + 1 : 0;
}

/** Do two intervals overlap? */
export function overlaps(a: IpInterval, b: IpInterval): boolean {
  return a.lo <= b.hi && b.lo <= a.hi;
}

/** True when `inner` is fully contained in `outer`. */
export function contains(outer: IpInterval, inner: IpInterval): boolean {
  return outer.lo <= inner.lo && inner.hi <= outer.hi;
}

/** True when two intervals are adjacent (touch with no gap). */
export function adjacent(a: IpInterval, b: IpInterval): boolean {
  return a.hi + 1 === b.lo || b.hi + 1 === a.lo;
}

/** Merge a set of intervals into the minimal set of disjoint intervals. */
export function coalesce(intervals: IpInterval[]): IpInterval[] {
  if (intervals.length === 0) return [];
  const sorted = [...intervals].sort((a, b) => a.lo - b.lo);
  const out: IpInterval[] = [{ ...sorted[0] }];
  for (let i = 1; i < sorted.length; i++) {
    const last = out[out.length - 1];
    if (sorted[i].lo <= last.hi + 1) last.hi = Math.max(last.hi, sorted[i].hi);
    else out.push({ ...sorted[i] });
  }
  return out;
}

/** Is this a public (routable) address, i.e. not RFC1918 private space? */
export function isPublic(ip: number): boolean {
  const a = (ip >>> 24) & 0xff;
  const b = (ip >>> 16) & 0xff;
  if (a === 10) return false;
  if (a === 172 && b >= 16 && b <= 31) return false;
  if (a === 192 && b === 168) return false;
  if (a === 127) return false; // loopback
  if (a === 169 && b === 254) return false; // link-local
  return true;
}

/** Longest-prefix match: pick the interval whose prefix best covers `ip`. */
export function longestPrefixMatch<T extends { interval: IpInterval; prefixLen: number }>(
  routes: T[],
  ip: number,
): T | null {
  let best: T | null = null;
  for (const r of routes) {
    if (ip >= r.interval.lo && ip <= r.interval.hi) {
      if (!best || r.prefixLen > best.prefixLen) best = r;
    }
  }
  return best;
}

/** Prefix length from a CIDR string (the number after the slash; /32 default). */
export function prefixLen(cidr: string): number {
  const s = (cidr ?? "").trim();
  const idx = s.indexOf("/");
  if (idx === -1) return 32;
  const n = Number(s.slice(idx + 1));
  return Number.isInteger(n) ? n : 32;
}
