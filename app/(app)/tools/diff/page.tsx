"use client";

/* eslint-disable @typescript-eslint/no-explicit-any */

import { useState } from "react";
import { GitCompare, UploadCloud, ShieldAlert, Plus, Minus, Pencil } from "lucide-react";
import { PageHeader } from "@/components/data/PageHeader";
import { StatCard } from "@/components/data/StatCard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { parseInfraFile, ParseError } from "@/lib/offline/parse";
import type { ParsedEstate } from "@/lib/offline/estate";

type Sev = "critical" | "high" | "normal";
const CRIT: Record<string, string> = { "22": "SSH", "3389": "RDP", "23": "Telnet", "5985": "WinRM", "5986": "WinRM" };
const HIGH: Record<string, string> = {
  "1433": "SQL Server", "3306": "MySQL", "5432": "PostgreSQL", "6379": "Redis", "27017": "MongoDB", "1521": "Oracle", "445": "SMB", "21": "FTP",
};
const OPEN = new Set(["*", "0.0.0.0/0", "internet", "any"]);

interface OpenRule {
  key: string;
  nsg: string;
  rule: string;
  source: string;
  ports: string;
  service: string;
  severity: Sev;
}

function classify(ports: string[]): { service: string; severity: Sev } {
  let sev: Sev = "normal";
  const names: string[] = [];
  for (const p of ports) {
    if (p === "*" || p === "0-65535") { sev = "critical"; names.push("ALL"); }
    else if (CRIT[p]) { sev = "critical"; names.push(CRIT[p]); }
    else if (HIGH[p]) { if (sev !== "critical") sev = "high"; names.push(HIGH[p]); }
  }
  return { service: names.length ? [...new Set(names)].join(", ") : "custom", severity: sev };
}

function openRules(estate: ParsedEstate): Map<string, OpenRule> {
  const out = new Map<string, OpenRule>();
  const nsgs = (estate.byType["microsoft.network/networksecuritygroups"] ?? []) as any[];
  for (const nsg of nsgs) {
    for (const rule of nsg.properties?.securityRules ?? []) {
      const p = rule.properties ?? {};
      if (p.direction !== "Inbound" || p.access !== "Allow") continue;
      const srcs = [p.sourceAddressPrefix, ...(p.sourceAddressPrefixes ?? [])].filter(Boolean).map((s: string) => s.toLowerCase());
      if (!srcs.some((s: string) => OPEN.has(s))) continue;
      const ports = [p.destinationPortRange, ...(p.destinationPortRanges ?? [])].filter(Boolean) as string[];
      const { service, severity } = classify(ports);
      const key = `${nsg.name}::${rule.name}`;
      out.set(key, {
        key,
        nsg: nsg.name,
        rule: rule.name,
        source: p.sourceAddressPrefix || (p.sourceAddressPrefixes ?? []).join(", ") || "*",
        ports: ports.join(", ") || "*",
        service,
        severity,
      });
    }
  }
  return out;
}

const idOf = (r: any) => (r.id ? String(r.id).toLowerCase() : `${r.type}/${r.name}`.toLowerCase());
const allResources = (e: ParsedEstate) => Object.values(e.byType).flat() as any[];

function Dropzone({ label, estate, onLoad }: { label: string; estate: ParsedEstate | null; onLoad: (e: ParsedEstate) => void }) {
  const [error, setError] = useState<string | null>(null);
  const [over, setOver] = useState(false);
  const handle = async (file: File) => {
    setError(null);
    try {
      const text = await file.text();
      onLoad(parseInfraFile(file.name, text, file.lastModified));
    } catch (e) {
      setError(e instanceof ParseError || e instanceof Error ? e.message : String(e));
    }
  };
  return (
    <div>
      <label
        onDragOver={(e) => { e.preventDefault(); setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); const f = e.dataTransfer.files?.[0]; if (f) void handle(f); }}
        className={cn(
          "flex cursor-pointer flex-col items-center gap-1.5 rounded-lg border-2 border-dashed px-4 py-6 text-center text-sm transition-colors",
          over ? "border-primary bg-primary/5" : estate ? "border-emerald-500/40 bg-emerald-500/5" : "border-border hover:border-primary/50",
        )}
      >
        <UploadCloud className="h-6 w-6 text-muted-foreground" />
        <span className="font-medium">{label}</span>
        {estate ? (
          <span className="text-[11px] text-emerald-600 dark:text-emerald-400">
            {estate.fileName} · {estate.total} resources
          </span>
        ) : (
          <span className="text-[11px] text-muted-foreground">ARM JSON or Terraform .tfstate</span>
        )}
        <input type="file" accept=".json,.tfstate,application/json" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void handle(f); }} />
      </label>
      {error && <p className="mt-1 text-[11px] text-destructive">{error}</p>}
    </div>
  );
}

export default function DiffPage() {
  const [base, setBase] = useState<ParsedEstate | null>(null);
  const [cand, setCand] = useState<ParsedEstate | null>(null);

  const ready = base && cand;

  let added: any[] = [], removed: any[] = [], changed: any[] = [];
  let newExposed: OpenRule[] = [], closed: OpenRule[] = [];
  if (ready) {
    const baseMap = new Map(allResources(base).map((r) => [idOf(r), r]));
    const candMap = new Map(allResources(cand).map((r) => [idOf(r), r]));
    added = [...candMap].filter(([id]) => !baseMap.has(id)).map(([, r]) => r);
    removed = [...baseMap].filter(([id]) => !candMap.has(id)).map(([, r]) => r);
    changed = [...candMap]
      .filter(([id, r]) => baseMap.has(id) && JSON.stringify(baseMap.get(id)?.properties) !== JSON.stringify(r.properties))
      .map(([, r]) => r);
    const baseOpen = openRules(base), candOpen = openRules(cand);
    newExposed = [...candOpen.values()].filter((r) => !baseOpen.has(r.key)).sort((a, b) => rank(a.severity) - rank(b.severity));
    closed = [...baseOpen.values()].filter((r) => !candOpen.has(r.key));
  }

  const criticalNew = newExposed.filter((r) => r.severity !== "normal").length;

  return (
    <>
      <PageHeader
        icon={<GitCompare className="h-5 w-5" />}
        title="Change Review (pre-deployment diff)"
        description="Compare two infrastructure files — a baseline and a proposed change — and see what's added, removed, and, crucially, which new paths open to the internet. Parsed entirely in your browser."
      />

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Baseline (current)</CardTitle></CardHeader>
          <CardContent><Dropzone label="Drop the current state" estate={base} onLoad={setBase} /></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Candidate (proposed change)</CardTitle></CardHeader>
          <CardContent><Dropzone label="Drop the proposed state / plan" estate={cand} onLoad={setCand} /></CardContent>
        </Card>
      </div>

      {!ready && (
        <Alert>
          <AlertTitle>Upload two files to compare</AlertTitle>
          <AlertDescription>
            Typical use: your current Terraform state as the baseline, and the state after a
            proposed change (or two ARM exports) as the candidate. Nothing is uploaded — both
            files are parsed and diffed locally.
          </AlertDescription>
        </Alert>
      )}

      {ready && (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <StatCard label="Added" value={added.length} icon={<Plus className="h-4 w-4" />} />
            <StatCard label="Removed" value={removed.length} icon={<Minus className="h-4 w-4" />} />
            <StatCard label="Changed" value={changed.length} icon={<Pencil className="h-4 w-4" />} />
            <StatCard label="Newly internet-exposed" value={criticalNew} icon={<ShieldAlert className="h-4 w-4" />} />
          </div>

          {newExposed.length > 0 && (
            <Alert variant={criticalNew > 0 ? "destructive" : "default"}>
              <ShieldAlert className="h-4 w-4" />
              <AlertTitle>{newExposed.length} new path{newExposed.length === 1 ? "" : "s"} open to the internet in this change</AlertTitle>
              <AlertDescription>
                These inbound rules allow traffic from any source in the candidate but not the baseline.
                Review before deploying.
              </AlertDescription>
            </Alert>
          )}

          {newExposed.length > 0 && (
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-base">Newly exposed to the internet</CardTitle></CardHeader>
              <CardContent className="space-y-2 text-sm">
                {newExposed.map((r) => (
                  <div key={r.key} className="flex flex-wrap items-center gap-2 rounded-md border bg-card/60 px-3 py-2">
                    <Badge variant={r.severity === "critical" ? "destructive" : r.severity === "high" ? "warning" : "secondary"}>
                      {r.service}
                    </Badge>
                    <span className="font-mono text-[12px]">{r.nsg} / {r.rule}</span>
                    <span className="ml-auto text-[11px] text-muted-foreground">from {r.source} · ports {r.ports}</span>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          <div className="grid gap-4 lg:grid-cols-3">
            <ChangeList title="Added" tone="added" items={added} />
            <ChangeList title="Removed" tone="removed" items={removed} />
            <ChangeList title="Changed" tone="changed" items={changed} />
          </div>

          {closed.length > 0 && (
            <p className="text-[12px] text-muted-foreground">
              Also: {closed.length} internet-open path{closed.length === 1 ? "" : "s"} closed by this change.
            </p>
          )}
        </>
      )}
    </>
  );
}

function rank(s: Sev): number {
  return s === "critical" ? 0 : s === "high" ? 1 : 2;
}

function ChangeList({ title, tone, items }: { title: string; tone: "added" | "removed" | "changed"; items: any[] }) {
  const color = tone === "added" ? "text-emerald-600 dark:text-emerald-400" : tone === "removed" ? "text-destructive" : "text-amber-600 dark:text-amber-400";
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className={cn("text-sm", color)}>{title} · {items.length}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-1.5 text-[12px]">
        {items.length === 0 && <span className="text-muted-foreground">None.</span>}
        {items.slice(0, 50).map((r, i) => (
          <div key={i} className="truncate rounded border bg-background/60 px-2 py-1">
            <span className="font-medium">{r.name ?? "(unnamed)"}</span>
            <span className="ml-1.5 font-mono text-[10.5px] text-muted-foreground">{String(r.type ?? "").split("/").pop()}</span>
          </div>
        ))}
        {items.length > 50 && <span className="text-muted-foreground">+{items.length - 50} more</span>}
      </CardContent>
    </Card>
  );
}
