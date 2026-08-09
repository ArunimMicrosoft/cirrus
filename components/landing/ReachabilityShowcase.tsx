"use client";

import * as React from "react";

/**
 * ReachabilityShowcase — a marketing-only animated version of the product's
 * network reachability flow graph. It uses a SYNTHETIC sample estate (made-up
 * subnet names and paths), never any customer data, so it is safe to render on
 * the public landing page. It auto-tours through a few subnets so the page
 * feels alive; hovering pauses it, clicking a node pins it.
 *
 * Pure SVG + React. No data fetched, no writes — same read-only spirit as the
 * real feature, just running on illustrative data.
 */

type Sev = "critical" | "high" | "normal";

const COLOR: Record<Sev, string> = {
  normal: "#10b981", // emerald-500
  high: "#f59e0b", // amber-500
  critical: "#ef4444", // red-500
};
const SEV_RANK: Record<Sev, number> = { normal: 0, high: 1, critical: 2 };

interface Edge {
  from: string;
  to: string;
  service: string;
  sev: Sev;
}

/* ---- Synthetic sample estate (illustrative — not real data) ---- */

const NODES: string[] = [
  "hub/GatewaySubnet",
  "hub/AzureFirewall",
  "prod/web-tier",
  "prod/app-tier",
  "prod/data-tier",
  "prod/cache",
  "prod/bastion",
  "shared/jumpbox",
  "shared/monitoring",
  "dmz/appgw",
  "dev/sandbox",
];

const EDGES: Edge[] = [
  { from: "dmz/appgw", to: "prod/web-tier", service: "HTTPS", sev: "normal" },
  { from: "hub/GatewaySubnet", to: "prod/web-tier", service: "HTTPS", sev: "normal" },
  { from: "prod/web-tier", to: "prod/app-tier", service: "HTTPS", sev: "normal" },
  { from: "prod/web-tier", to: "prod/cache", service: "Redis", sev: "high" },
  { from: "prod/app-tier", to: "prod/data-tier", service: "SQL Server", sev: "high" },
  { from: "prod/app-tier", to: "prod/cache", service: "Redis", sev: "high" },
  { from: "prod/app-tier", to: "shared/monitoring", service: "HTTPS", sev: "normal" },
  { from: "prod/web-tier", to: "shared/monitoring", service: "HTTPS", sev: "normal" },
  { from: "prod/data-tier", to: "shared/monitoring", service: "HTTPS", sev: "normal" },
  { from: "prod/bastion", to: "prod/web-tier", service: "SSH", sev: "critical" },
  { from: "prod/bastion", to: "prod/app-tier", service: "SSH", sev: "critical" },
  { from: "prod/bastion", to: "prod/data-tier", service: "RDP", sev: "critical" },
  { from: "shared/jumpbox", to: "prod/web-tier", service: "RDP", sev: "critical" },
  { from: "shared/jumpbox", to: "prod/app-tier", service: "RDP", sev: "critical" },
  { from: "shared/jumpbox", to: "prod/data-tier", service: "RDP", sev: "critical" },
  { from: "shared/monitoring", to: "prod/web-tier", service: "HTTPS", sev: "normal" },
  { from: "shared/monitoring", to: "prod/app-tier", service: "HTTPS", sev: "normal" },
  { from: "shared/monitoring", to: "prod/data-tier", service: "1433", sev: "high" },
  { from: "hub/AzureFirewall", to: "hub/GatewaySubnet", service: "all ports", sev: "critical" },
  { from: "hub/GatewaySubnet", to: "hub/AzureFirewall", service: "all ports", sev: "critical" },
  { from: "dev/sandbox", to: "prod/web-tier", service: "HTTP", sev: "normal" },
];

const TOUR = ["prod/app-tier", "prod/web-tier", "shared/jumpbox", "prod/data-tier", "hub/GatewaySubnet"];

/* ---- Layout ---- */

const W = 780;
const LEFT_X = 176;
const RIGHT_X = W - 176;
const CENTER_X = W / 2;
const ROW_H = 30;
const TOP_PAD = 46;
const BOTTOM_PAD = 22;
const NODE_R = 4.5;
const CENTER_R = 8;

function shortName(label: string): string {
  return label.length <= 22 ? label : `${label.slice(0, 21)}…`;
}

function spoke(x1: number, y1: number, x2: number, y2: number): string {
  const mx = (x1 + x2) / 2;
  return `M ${x1.toFixed(1)} ${y1.toFixed(1)} C ${mx.toFixed(1)} ${y1.toFixed(1)}, ${mx.toFixed(1)} ${y2.toFixed(1)}, ${x2.toFixed(1)} ${y2.toFixed(1)}`;
}

// Fixed height so the panel doesn't jump as the tour changes focus.
const MAX_ROWS = (() => {
  let m = 1;
  for (const n of NODES) {
    const inc = EDGES.filter((e) => e.to === n).length;
    const out = EDGES.filter((e) => e.from === n).length;
    m = Math.max(m, inc, out);
  }
  return m;
})();
const CONTENT_H = MAX_ROWS * ROW_H;
const H = TOP_PAD + CONTENT_H + BOTTOM_PAD;
const CENTER_Y = TOP_PAD + CONTENT_H / 2;

export function ReachabilityGraphPanel() {
  const [autoIdx, setAutoIdx] = React.useState(0);
  const [pinned, setPinned] = React.useState<string | null>(null);
  const hoverRef = React.useRef(false);

  React.useEffect(() => {
    const t = setInterval(() => {
      if (hoverRef.current || pinned) return;
      setAutoIdx((v) => (v + 1) % TOUR.length);
    }, 4200);
    return () => clearInterval(t);
  }, [pinned]);

  const focus = pinned ?? TOUR[autoIdx];

  const inbound = React.useMemo(
    () => EDGES.filter((e) => e.to === focus).sort((a, b) => SEV_RANK[b.sev] - SEV_RANK[a.sev]),
    [focus],
  );
  const outbound = React.useMemo(
    () => EDGES.filter((e) => e.from === focus).sort((a, b) => SEV_RANK[b.sev] - SEV_RANK[a.sev]),
    [focus],
  );

  const summary = React.useMemo(() => {
    let critical = 0, high = 0, normal = 0;
    for (const e of EDGES) {
      if (e.sev === "critical") critical++;
      else if (e.sev === "high") high++;
      else normal++;
    }
    return { critical, high, normal };
  }, []);

  const inTop = TOP_PAD + (CONTENT_H - inbound.length * ROW_H) / 2;
  const outTop = TOP_PAD + (CONTENT_H - outbound.length * ROW_H) / 2;
  const yIn = (i: number) => inTop + i * ROW_H + ROW_H / 2;
  const yOut = (i: number) => outTop + i * ROW_H + ROW_H / 2;

  const worst = [...inbound, ...outbound].sort((a, b) => SEV_RANK[b.sev] - SEV_RANK[a.sev])[0];
  const focusLabel = shortName(focus);
  const pillW = focusLabel.length * 6.6 + 22;

  const impact =
    worst?.sev === "critical"
      ? `remote-admin / wide-open path reachable — a direct lateral-movement route.`
      : worst?.sev === "high"
      ? `a sensitive service (database / cache) is reachable across subnets.`
      : `only ordinary application traffic — nicely contained.`;

  return (
    <div className="cc-panel rounded-2xl p-4 md:p-6">
          {/* header row */}
          <div className="mb-3 flex flex-wrap items-center gap-2 text-[11.5px]">
            <Chip color={COLOR.critical} count={summary.critical} label="critical" />
            <Chip color={COLOR.high} count={summary.high} label="sensitive" />
            <Chip color={COLOR.normal} count={summary.normal} label="ordinary" />
            <span className="ml-auto inline-flex items-center gap-1.5 rounded-md border bg-background/50 px-2 py-1 font-mono text-[10.5px] text-muted-foreground">
              Sample estate · illustrative data
            </span>
          </div>

          {/* impact banner */}
          <p
            className="mb-3 rounded-md border-l-2 px-3 py-2 text-[12px] text-foreground transition-colors"
            style={{ borderColor: COLOR[worst?.sev ?? "normal"], background: `${COLOR[worst?.sev ?? "normal"]}12` }}
          >
            <span className="font-semibold font-mono">{focusLabel}</span> — {impact}
          </p>

          <svg
            viewBox={`0 0 ${W} ${H}`}
            className="h-auto w-full"
            role="img"
            aria-label="Animated sample subnet reachability: sources on the left, focused subnet in the centre, destinations on the right"
            onMouseEnter={() => (hoverRef.current = true)}
            onMouseLeave={() => {
              hoverRef.current = false;
              setPinned(null);
            }}
          >
            <defs>
              {(["critical", "high", "normal"] as Sev[]).map((sev) => (
                <marker key={sev} id={`sc-arrow-${sev}`} viewBox="0 0 10 10" refX="8.5" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                  <path d="M0,0 L10,5 L0,10 z" fill={COLOR[sev]} />
                </marker>
              ))}
            </defs>

            <text x={LEFT_X} y={22} textAnchor="middle" className="fill-muted-foreground" style={{ fontSize: "10px", fontWeight: 700, letterSpacing: "0.06em" }}>
              {`REACHABLE FROM · ${inbound.length}`}
            </text>
            <text x={RIGHT_X} y={22} textAnchor="middle" className="fill-muted-foreground" style={{ fontSize: "10px", fontWeight: 700, letterSpacing: "0.06em" }}>
              {`CAN REACH · ${outbound.length}`}
            </text>

            {/* inbound spokes */}
            {inbound.map((e, i) => {
              const y = yIn(i);
              const color = COLOR[e.sev];
              const x1 = LEFT_X + NODE_R;
              const dx = CENTER_X - x1;
              const dy = CENTER_Y - y;
              const len = Math.hypot(dx, dy) || 1;
              const x2 = CENTER_X - (dx / len) * (CENTER_R + 6);
              const y2 = CENTER_Y - (dy / len) * (CENTER_R + 6);
              const d = spoke(x1, y, x2, y2);
              const dur = e.sev === "critical" ? 1.7 : e.sev === "high" ? 2.1 : 2.6;
              return (
                <g key={`in-${focus}-${i}`}>
                  <path id={`sc-in-${i}`} d={d} fill="none" stroke={color} strokeOpacity={0.5} strokeWidth={e.sev === "normal" ? 1.5 : 2} markerEnd={`url(#sc-arrow-${e.sev})`} />
                  <path className="cc-edge-flow" d={d} fill="none" stroke={color} strokeWidth={e.sev === "critical" ? 2.2 : 1.6} strokeOpacity={0.85} />
                  <circle r={e.sev === "critical" ? 3.2 : 2.7} fill={color}>
                    <animateMotion dur={`${dur}s`} repeatCount="indefinite" begin={`${(i % 6) * 0.22}s`}>
                      <mpath href={`#sc-in-${i}`} />
                    </animateMotion>
                  </circle>
                  <ShowNode x={LEFT_X} y={y} color={color} side="left" name={shortName(e.from)} service={e.service} onPick={() => setPinned(e.from)} />
                </g>
              );
            })}

            {/* outbound spokes */}
            {outbound.map((e, i) => {
              const y = yOut(i);
              const color = COLOR[e.sev];
              const x2 = RIGHT_X - NODE_R;
              const dx = x2 - CENTER_X;
              const dy = y - CENTER_Y;
              const len = Math.hypot(dx, dy) || 1;
              const x1 = CENTER_X + (dx / len) * (CENTER_R + 6);
              const y1 = CENTER_Y + (dy / len) * (CENTER_R + 6);
              const d = spoke(x1, y1, x2 - 4, y);
              const dur = e.sev === "critical" ? 1.7 : e.sev === "high" ? 2.1 : 2.6;
              return (
                <g key={`out-${focus}-${i}`}>
                  <path id={`sc-out-${i}`} d={d} fill="none" stroke={color} strokeOpacity={0.5} strokeWidth={e.sev === "normal" ? 1.5 : 2} markerEnd={`url(#sc-arrow-${e.sev})`} />
                  <path className="cc-edge-flow" d={d} fill="none" stroke={color} strokeWidth={e.sev === "critical" ? 2.2 : 1.6} strokeOpacity={0.85} />
                  <circle r={e.sev === "critical" ? 3.2 : 2.7} fill={color}>
                    <animateMotion dur={`${dur}s`} repeatCount="indefinite" begin={`${(i % 6) * 0.22}s`}>
                      <mpath href={`#sc-out-${i}`} />
                    </animateMotion>
                  </circle>
                  <ShowNode x={RIGHT_X} y={y} color={color} side="right" name={shortName(e.to)} service={e.service} onPick={() => setPinned(e.to)} />
                </g>
              );
            })}

            {/* focus node */}
            <g>
              <circle cx={CENTER_X} cy={CENTER_Y} r={CENTER_R + 4} fill={COLOR.normal} opacity={0.18}>
                <animate attributeName="r" values={`${CENTER_R + 4};${CENTER_R + 12};${CENTER_R + 4}`} dur="2.4s" repeatCount="indefinite" />
                <animate attributeName="opacity" values="0.28;0;0.28" dur="2.4s" repeatCount="indefinite" />
              </circle>
              <circle cx={CENTER_X} cy={CENTER_Y} r={CENTER_R} fill={COLOR.normal} stroke="hsl(var(--background))" strokeWidth={2} />
              <rect x={CENTER_X - pillW / 2} y={CENTER_Y - CENTER_R - 24} width={pillW} height={18} rx={4} fill="hsl(var(--background))" stroke="hsl(var(--border))" />
              <text x={CENTER_X} y={CENTER_Y - CENTER_R - 11.5} textAnchor="middle" className="fill-foreground" style={{ fontSize: "10.5px", fontWeight: 700, fontFamily: "var(--font-mono, monospace)" }}>
                {focusLabel}
              </text>
            </g>

            {(inbound.length === 0 || outbound.length === 0) && (
              <text x={CENTER_X} y={H - 6} textAnchor="middle" className="fill-muted-foreground" style={{ fontSize: "10px" }}>
                {inbound.length === 0
                  ? "Nothing can reach this subnet — it only initiates connections."
                  : "This subnet reaches nothing — it only receives connections."}
              </text>
            )}
          </svg>

          {/* legend + hint */}
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-[11px]">
            <span className="inline-flex items-center gap-1.5 text-muted-foreground">
              <span className="h-2.5 w-4 rounded-full" style={{ background: COLOR.normal }} /> ordinary
            </span>
            <span className="inline-flex items-center gap-1.5 text-muted-foreground">
              <span className="h-2.5 w-4 rounded-full" style={{ background: COLOR.high }} /> sensitive (DB / cache)
            </span>
            <span className="inline-flex items-center gap-1.5 text-muted-foreground">
              <span className="h-2.5 w-4 rounded-full" style={{ background: COLOR.critical }} /> wide-open / remote-admin
            </span>
            <span className="ml-auto font-mono text-[10.5px] text-muted-foreground/80">
              Auto-touring · hover to pause · click a subnet to pin
            </span>
          </div>
        </div>
  );
}

function ShowNode({
  x,
  y,
  color,
  side,
  name,
  service,
  onPick,
}: {
  x: number;
  y: number;
  color: string;
  side: "left" | "right";
  name: string;
  service: string;
  onPick: () => void;
}) {
  const labelX = side === "left" ? x - NODE_R - 8 : x + NODE_R + 8;
  const anchor = side === "left" ? "end" : "start";
  return (
    <g style={{ cursor: "pointer" }} onClick={onPick}>
      <circle cx={x} cy={y} r={NODE_R} fill={color} fillOpacity={0.85} stroke={color} strokeWidth={1} />
      <text x={labelX} y={y - 2} textAnchor={anchor} className="fill-foreground" style={{ fontSize: "10px", fontFamily: "var(--font-mono, monospace)" }}>
        {name}
      </text>
      <text x={labelX} y={y + 9} textAnchor={anchor} style={{ fontSize: "8.5px", fontWeight: 600, fill: color }}>
        {service}
      </text>
    </g>
  );
}

function Chip({ color, count, label }: { color: string; count: number; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-md border px-2 py-1">
      <span className="h-2 w-2 rounded-full" style={{ background: color }} />
      <span className="font-semibold tabular-nums text-foreground">{count}</span>
      <span className="text-muted-foreground">{label}</span>
    </span>
  );
}
