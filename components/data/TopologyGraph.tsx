"use client";

import * as React from "react";

/**
 * TopologyGraph — a read-only subnet reachability & impact map.
 *
 * Drawing every reachable pair at once is an unreadable hairball, and a ring
 * layout puts the focused subnet on the perimeter so all its edges cross the
 * whole circle and every label stacks at one point. Instead this is a
 * left → centre → right FLOW view (an "ego graph"):
 *
 *     REACHABLE FROM            (focus)            CAN REACH
 *        source  ─────────▶   this subnet   ─────────▶  destination
 *
 * You pick one subnet; the sources that can reach it line up on the left, the
 * destinations it can reach line up on the right, and it sits in the centre.
 * Spokes are straight, so nothing crosses, and each path's service label lives
 * on its own row instead of piling up in the middle. Every path is coloured
 * and labelled by the service behind its allowed ports.
 *
 * Colour = risk (traffic-light):
 *   green  = ordinary traffic (web, DNS, custom app ports)
 *   amber  = sensitive service reachable (database, file share, FTP)
 *   red    = wide-open (all ports) OR remote admin (SSH / RDP / Telnet / WinRM)
 *
 * Pure SVG + React over data already fetched. No network calls, no writes.
 */

export type Severity = "critical" | "high" | "normal";

export interface GraphNode {
  id: string;
  label: string;
}

export interface GraphEdge {
  from: string;
  to: string;
  wideOpen?: boolean;
  /** Representative allowed ports, e.g. "22,3389" / "443" / "all". */
  ports?: string;
}

/* -------- Port → service classification -------- */

const PORT_MAP: Record<string, { name: string; sev: Severity }> = {
  "22": { name: "SSH", sev: "critical" },
  "3389": { name: "RDP", sev: "critical" },
  "23": { name: "Telnet", sev: "critical" },
  "5985": { name: "WinRM", sev: "critical" },
  "5986": { name: "WinRM", sev: "critical" },
  "1433": { name: "SQL Server", sev: "high" },
  "3306": { name: "MySQL", sev: "high" },
  "5432": { name: "PostgreSQL", sev: "high" },
  "6379": { name: "Redis", sev: "high" },
  "27017": { name: "MongoDB", sev: "high" },
  "1521": { name: "Oracle", sev: "high" },
  "445": { name: "SMB", sev: "high" },
  "139": { name: "NetBIOS", sev: "high" },
  "21": { name: "FTP", sev: "high" },
  "80": { name: "HTTP", sev: "normal" },
  "443": { name: "HTTPS", sev: "normal" },
  "8080": { name: "HTTP-alt", sev: "normal" },
  "53": { name: "DNS", sev: "normal" },
};

const SEV_RANK: Record<Severity, number> = { normal: 0, high: 1, critical: 2 };
const COLOR: Record<Severity, string> = {
  normal: "#10b981", // emerald-500
  high: "#f59e0b", // amber-500
  critical: "#ef4444", // red-500
};

interface EdgeClass {
  severity: Severity;
  service: string;
  impact: string;
}

function classifyEdge(edge: GraphEdge): EdgeClass {
  if (edge.wideOpen) {
    return {
      severity: "critical",
      service: "all ports",
      impact: "Every port is reachable — these subnets are effectively unsegmented.",
    };
  }
  const raw = (edge.ports ?? "").trim();
  if (!raw || raw === "—") {
    return { severity: "normal", service: "traffic", impact: "Reachable on the allowed ports." };
  }
  const tokens = raw.split(",").map((t) => t.trim()).filter(Boolean);
  const named: string[] = [];
  let worst: Severity = "normal";
  let unknown = 0;
  for (const tok of tokens) {
    const info = PORT_MAP[tok];
    if (info) {
      if (!named.includes(info.name)) named.push(info.name);
      if (SEV_RANK[info.sev] > SEV_RANK[worst]) worst = info.sev;
    } else {
      unknown += 1;
    }
  }
  const service =
    named.length > 0
      ? named.slice(0, 2).join(", ") + (named.length > 2 ? "…" : "")
      : `${tokens.length} port${tokens.length === 1 ? "" : "s"}`;

  let impact: string;
  if (worst === "critical") {
    impact = `Remote-admin service (${named.join(", ")}) reachable — a direct lateral-movement path.`;
  } else if (worst === "high") {
    impact = `Sensitive service (${named.join(", ")}) reachable from another subnet.`;
  } else {
    impact =
      named.length > 0
        ? `${named.join(", ")} — ordinary application traffic.`
        : `${tokens.length} custom port${tokens.length === 1 ? "" : "s"} reachable.`;
  }
  if (unknown > 0 && named.length > 0) impact += ` (+${unknown} more)`;
  return { severity: worst, service, impact };
}

/* -------- Layout (left → centre → right flow) -------- */

const W = 940;
const LEFT_X = 196;
const RIGHT_X = W - 196;
const CENTER_X = W / 2;
const ROW_H = 34;
const TOP_PAD = 58;
const BOTTOM_PAD = 26;
const CAP = 16; // rows shown per side before "+N more"
const NODE_R = 5;
const CENTER_R = 9;

function shortLabel(label: string, max = 22): string {
  if (label.length <= max) return label;
  const parts = label.split("/");
  const tail = parts[parts.length - 1] || label;
  return tail.length <= max ? tail : `${tail.slice(0, max - 1)}…`;
}

interface RichEdge extends GraphEdge {
  cls: EdgeClass;
}

/** Curved spoke between two points, bending horizontally for a clean flow. */
function spoke(x1: number, y1: number, x2: number, y2: number): string {
  const mx = (x1 + x2) / 2;
  return `M ${x1.toFixed(1)} ${y1.toFixed(1)} C ${mx.toFixed(1)} ${y1.toFixed(1)}, ${mx.toFixed(1)} ${y2.toFixed(1)}, ${x2.toFixed(1)} ${y2.toFixed(1)}`;
}

export function TopologyGraph({
  nodes,
  edges,
}: {
  nodes: GraphNode[];
  edges: GraphEdge[];
}) {
  const [selected, setSelected] = React.useState<string | null>(null);

  const richAll: RichEdge[] = React.useMemo(
    () => edges.map((e) => ({ ...e, cls: classifyEdge(e) })),
    [edges],
  );

  const nameById = React.useMemo(() => {
    const m = new Map<string, string>();
    nodes.forEach((n) => m.set(n.id, n.label));
    return m;
  }, [nodes]);

  const summary = React.useMemo(() => {
    let critical = 0, high = 0, normal = 0;
    for (const e of richAll) {
      if (e.cls.severity === "critical") critical += 1;
      else if (e.cls.severity === "high") high += 1;
      else normal += 1;
    }
    return { critical, high, normal, total: richAll.length };
  }, [richAll]);

  // Subnets that participate in at least one cross-subnet path, ranked by the
  // total risk weight touching them (so the default focus is the juiciest).
  const { rankedIds, riskById } = React.useMemo(() => {
    const risk = new Map<string, number>();
    const deg = new Map<string, number>();
    for (const e of richAll) {
      const w = SEV_RANK[e.cls.severity] + 1;
      risk.set(e.from, (risk.get(e.from) ?? 0) + w);
      risk.set(e.to, (risk.get(e.to) ?? 0) + w);
      deg.set(e.from, (deg.get(e.from) ?? 0) + 1);
      deg.set(e.to, (deg.get(e.to) ?? 0) + 1);
    }
    const ids = nodes
      .map((n) => n.id)
      .filter((id) => (deg.get(id) ?? 0) > 0)
      .sort((a, b) => (risk.get(b) ?? 0) - (risk.get(a) ?? 0));
    return { rankedIds: ids, riskById: risk };
  }, [nodes, richAll]);

  const participantSet = React.useMemo(() => new Set(rankedIds), [rankedIds]);

  React.useEffect(() => {
    if (selected && participantSet.has(selected)) return;
    if (rankedIds.length > 0) setSelected(rankedIds[0]);
  }, [rankedIds, participantSet, selected]);

  const focus = selected && participantSet.has(selected) ? selected : rankedIds[0] ?? null;

  // Split the focused subnet's edges into inbound (reachable from) and
  // outbound (can reach), worst-risk first.
  const { inbound, outbound } = React.useMemo(() => {
    const inb: RichEdge[] = [];
    const out: RichEdge[] = [];
    if (focus) {
      for (const e of richAll) {
        if (e.to === focus) inb.push(e);
        else if (e.from === focus) out.push(e);
      }
    }
    const bySev = (a: RichEdge, b: RichEdge) => SEV_RANK[b.cls.severity] - SEV_RANK[a.cls.severity];
    return { inbound: inb.sort(bySev), outbound: out.sort(bySev) };
  }, [focus, richAll]);

  const inShown = inbound.slice(0, CAP);
  const outShown = outbound.slice(0, CAP);
  const inMore = inbound.length - inShown.length;
  const outMore = outbound.length - outShown.length;

  const inTotalRows = inShown.length + (inMore > 0 ? 1 : 0);
  const outTotalRows = outShown.length + (outMore > 0 ? 1 : 0);
  const maxRows = Math.max(inTotalRows, outTotalRows, 1);
  const contentH = maxRows * ROW_H;
  const H = Math.max(300, TOP_PAD + contentH + BOTTOM_PAD);
  const centerY = TOP_PAD + contentH / 2;

  const inColTop = TOP_PAD + (contentH - inTotalRows * ROW_H) / 2;
  const outColTop = TOP_PAD + (contentH - outTotalRows * ROW_H) / 2;
  const yIn = (i: number) => inColTop + i * ROW_H + ROW_H / 2;
  const yOut = (i: number) => outColTop + i * ROW_H + ROW_H / 2;

  const worst = worstImpact(inbound, outbound);
  const focusName = focus ? shortLabel(nameById.get(focus) ?? focus) : "";
  const pillW = focusName.length * 7 + 24;

  if (rankedIds.length === 0) {
    return (
      <p className="text-sm text-success">
        No cross-subnet reachability detected — the estate is fully segmented,
        so there are no source → destination paths to draw.
      </p>
    );
  }

  return (
    <div className="w-full">
      {/* Summary + legend + picker */}
      <div className="mb-2 flex flex-wrap items-center gap-2 text-[11.5px]">
        <SummaryChip color={COLOR.critical} count={summary.critical} label="critical" />
        <SummaryChip color={COLOR.high} count={summary.high} label="sensitive" />
        <SummaryChip color={COLOR.normal} count={summary.normal} label="ordinary" />
        <span className="text-muted-foreground">
          paths across {summary.total} reachable pair{summary.total === 1 ? "" : "s"}
        </span>
        <label className="ml-auto inline-flex items-center gap-2 text-muted-foreground">
          Inspect subnet
          <select
            value={focus ?? ""}
            onChange={(e) => setSelected(e.target.value)}
            className="max-w-[240px] rounded-md border bg-background px-2 py-1 text-[12px] text-foreground"
          >
            {rankedIds
              .map((id) => ({ id, label: nameById.get(id) ?? id }))
              .sort((a, b) => a.label.localeCompare(b.label))
              .map((o) => (
                <option key={o.id} value={o.id}>
                  {shortLabel(o.label, 32)}
                </option>
              ))}
          </select>
        </label>
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-[11px]">
        <span className="inline-flex items-center gap-1.5 text-muted-foreground">
          <Dot c={COLOR.normal} /> ordinary
        </span>
        <span className="inline-flex items-center gap-1.5 text-muted-foreground">
          <Dot c={COLOR.high} /> sensitive (DB / file share)
        </span>
        <span className="inline-flex items-center gap-1.5 text-muted-foreground">
          <Dot c={COLOR.critical} /> wide-open / remote-admin
        </span>
      </div>

      {/* Plain-English impact banner for the focused subnet */}
      {worst && (
        <p
          className="mb-3 rounded-md border-l-2 px-3 py-2 text-[12px] text-foreground"
          style={{ borderColor: worst.color, background: `${worst.color}12` }}
        >
          <span className="font-semibold">{focusName}:</span> {worst.text}
        </p>
      )}

      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="h-auto w-full"
        role="img"
        aria-label="Subnet reachability flow: sources on the left, focused subnet in the centre, destinations on the right"
      >
        <defs>
          {(["critical", "high", "normal"] as Severity[]).map((sev) => (
            <marker
              key={sev}
              id={`cc-arrow-${sev}`}
              viewBox="0 0 10 10"
              refX="8.5"
              refY="5"
              markerWidth="6"
              markerHeight="6"
              orient="auto-start-reverse"
            >
              <path d="M0,0 L10,5 L0,10 z" fill={COLOR[sev]} />
            </marker>
          ))}
        </defs>

        {/* Column headers */}
        <text x={LEFT_X} y={26} textAnchor="middle" className="fill-muted-foreground" style={{ fontSize: "10.5px", fontWeight: 700, letterSpacing: "0.06em" }}>
          {`REACHABLE FROM · ${inbound.length}`}
        </text>
        <text x={RIGHT_X} y={26} textAnchor="middle" className="fill-muted-foreground" style={{ fontSize: "10.5px", fontWeight: 700, letterSpacing: "0.06em" }}>
          {`CAN REACH · ${outbound.length}`}
        </text>

        {/* Inbound spokes: source (left) → focus (centre) */}
        {inShown.map((e, i) => {
          const y = yIn(i);
          const color = COLOR[e.cls.severity];
          const x1 = LEFT_X + NODE_R;
          const dx = CENTER_X - x1;
          const dy = centerY - y;
          const len = Math.hypot(dx, dy) || 1;
          const x2 = CENTER_X - (dx / len) * (CENTER_R + 6);
          const y2 = centerY - (dy / len) * (CENTER_R + 6);
          const d = spoke(x1, y, x2, y2);
          const dur = e.cls.severity === "critical" ? 1.7 : e.cls.severity === "high" ? 2.1 : 2.6;
          return (
            <g key={`in-${i}`}>
              <title>{`${shortLabel(nameById.get(e.from) ?? e.from)} → ${focusName} · ${e.cls.service} · ${e.cls.severity}`}</title>
              <path id={`cc-in-${i}`} d={d} fill="none" stroke={color} strokeOpacity={0.5} strokeWidth={e.cls.severity === "normal" ? 1.5 : 2} markerEnd={`url(#cc-arrow-${e.cls.severity})`} />
              <path className="cc-edge-flow" d={d} fill="none" stroke={color} strokeWidth={e.cls.severity === "critical" ? 2.2 : 1.6} strokeOpacity={0.85} />
              <circle r={e.cls.severity === "critical" ? 3.4 : 2.8} fill={color}>
                <animateMotion dur={`${dur}s`} repeatCount="indefinite" begin={`${(i % 6) * 0.22}s`}>
                  <mpath href={`#cc-in-${i}`} />
                </animateMotion>
              </circle>
              <FlowNode x={LEFT_X} y={y} color={color} side="left" name={shortLabel(nameById.get(e.from) ?? e.from)} service={e.cls.service} />
            </g>
          );
        })}
        {inMore > 0 && (
          <text x={LEFT_X - NODE_R - 8} y={yIn(inShown.length) + 3} textAnchor="end" className="fill-muted-foreground" style={{ fontSize: "10px" }}>
            {`+${inMore} more`}
          </text>
        )}

        {/* Outbound spokes: focus (centre) → destination (right) */}
        {outShown.map((e, i) => {
          const y = yOut(i);
          const color = COLOR[e.cls.severity];
          const x2 = RIGHT_X - NODE_R;
          const dx = x2 - CENTER_X;
          const dy = y - centerY;
          const len = Math.hypot(dx, dy) || 1;
          const x1 = CENTER_X + (dx / len) * (CENTER_R + 6);
          const y1 = centerY + (dy / len) * (CENTER_R + 6);
          const d = spoke(x1, y1, x2 - 4, y);
          const dur = e.cls.severity === "critical" ? 1.7 : e.cls.severity === "high" ? 2.1 : 2.6;
          return (
            <g key={`out-${i}`}>
              <title>{`${focusName} → ${shortLabel(nameById.get(e.to) ?? e.to)} · ${e.cls.service} · ${e.cls.severity}`}</title>
              <path id={`cc-out-${i}`} d={d} fill="none" stroke={color} strokeOpacity={0.5} strokeWidth={e.cls.severity === "normal" ? 1.5 : 2} markerEnd={`url(#cc-arrow-${e.cls.severity})`} />
              <path className="cc-edge-flow" d={d} fill="none" stroke={color} strokeWidth={e.cls.severity === "critical" ? 2.2 : 1.6} strokeOpacity={0.85} />
              <circle r={e.cls.severity === "critical" ? 3.4 : 2.8} fill={color}>
                <animateMotion dur={`${dur}s`} repeatCount="indefinite" begin={`${(i % 6) * 0.22}s`}>
                  <mpath href={`#cc-out-${i}`} />
                </animateMotion>
              </circle>
              <FlowNode x={RIGHT_X} y={y} color={color} side="right" name={shortLabel(nameById.get(e.to) ?? e.to)} service={e.cls.service} />
            </g>
          );
        })}
        {outMore > 0 && (
          <text x={RIGHT_X + NODE_R + 8} y={yOut(outShown.length) + 3} textAnchor="start" className="fill-muted-foreground" style={{ fontSize: "10px" }}>
            {`+${outMore} more`}
          </text>
        )}

        {/* Focused subnet in the centre */}
        <g>
          <circle cx={CENTER_X} cy={centerY} r={CENTER_R + 4} fill={COLOR.normal} opacity={0.18}>
            <animate attributeName="r" values={`${CENTER_R + 4};${CENTER_R + 12};${CENTER_R + 4}`} dur="2.4s" repeatCount="indefinite" />
            <animate attributeName="opacity" values="0.28;0;0.28" dur="2.4s" repeatCount="indefinite" />
          </circle>
          <circle cx={CENTER_X} cy={centerY} r={CENTER_R} fill={COLOR.normal} stroke="hsl(var(--background))" strokeWidth={2} />
          <g>
            <rect x={CENTER_X - pillW / 2} y={centerY - CENTER_R - 26} width={pillW} height={19} rx={4} fill="hsl(var(--background))" stroke="hsl(var(--border))" />
            <text x={CENTER_X} y={centerY - CENTER_R - 13} textAnchor="middle" className="fill-foreground" style={{ fontSize: "11px", fontWeight: 700, fontFamily: "var(--font-mono, monospace)" }}>
              {focusName}
            </text>
          </g>
        </g>

        {(inbound.length === 0 || outbound.length === 0) && (
          <text x={CENTER_X} y={H - 8} textAnchor="middle" className="fill-muted-foreground" style={{ fontSize: "10.5px" }}>
            {inbound.length === 0 && outbound.length === 0
              ? "This subnet has no cross-subnet paths — nicely isolated."
              : inbound.length === 0
              ? "Nothing can reach this subnet — it only initiates connections."
              : "This subnet reaches nothing — it only receives connections."}
          </text>
        )}
      </svg>

      <div className="mt-2 text-[11px] text-muted-foreground">
        Sources that can reach <span className="font-mono text-foreground">{focusName}</span> are on the left; what
        it can reach is on the right. Arrows follow the direction of allowed traffic and the dot shows the flow.
        Red and amber paths are the lateral-movement routes worth tightening first. Pick another subnet above to re-centre.
      </div>
    </div>
  );
}

/* -------- Sub-components -------- */

function FlowNode({
  x,
  y,
  color,
  side,
  name,
  service,
}: {
  x: number;
  y: number;
  color: string;
  side: "left" | "right";
  name: string;
  service: string;
}) {
  const labelX = side === "left" ? x - NODE_R - 8 : x + NODE_R + 8;
  const anchor = side === "left" ? "end" : "start";
  return (
    <g>
      <circle cx={x} cy={y} r={NODE_R} fill={color} fillOpacity={0.85} stroke={color} strokeWidth={1} />
      <text x={labelX} y={y - 2} textAnchor={anchor} className="fill-foreground" style={{ fontSize: "10.5px", fontFamily: "var(--font-mono, monospace)" }}>
        {name}
      </text>
      <text x={labelX} y={y + 9.5} textAnchor={anchor} style={{ fontSize: "9px", fontWeight: 600, fill: color }}>
        {service}
      </text>
    </g>
  );
}

/** Worst-severity plain-English line across all of the focus's paths. */
function worstImpact(inbound: RichEdge[], outbound: RichEdge[]): { text: string; color: string } | null {
  const all = [...inbound, ...outbound];
  if (all.length === 0) return null;
  const worst = [...all].sort((a, b) => SEV_RANK[b.cls.severity] - SEV_RANK[a.cls.severity])[0];
  return { text: worst.cls.impact, color: COLOR[worst.cls.severity] };
}

function Dot({ c }: { c: string }) {
  return <span className="h-2.5 w-4 shrink-0 rounded-full" style={{ background: c }} />;
}

function SummaryChip({ color, count, label }: { color: string; count: number; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-md border px-2 py-1">
      <span className="h-2 w-2 rounded-full" style={{ background: color }} />
      <span className="font-semibold tabular-nums text-foreground">{count}</span>
      <span className="text-muted-foreground">{label}</span>
    </span>
  );
}
