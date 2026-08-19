"use client";

import Link from "next/link";
import { ClipboardCheck, ArrowUpRight } from "lucide-react";
import { PageHeader } from "@/components/data/PageHeader";
import { StatCard } from "@/components/data/StatCard";
import { ExportButtons } from "@/components/data/ExportButtons";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { COMPLIANCE_CONTROLS, FRAMEWORKS } from "@/lib/compliance";

/**
 * Compliance crosswalk — a coverage map from Meridian's read-only checks to
 * CIS / MCSB / NIST / ISO 27001 / SOC 2 / PCI control IDs. Static reference,
 * works in any mode (including the no-login demo). Exportable as an auditor
 * evidence pack.
 */
export default function CompliancePage() {
  const controls = COMPLIANCE_CONTROLS;

  return (
    <>
      <PageHeader
        icon={<ClipboardCheck className="h-5 w-5" />}
        title="Compliance Crosswalk"
        description="How Meridian's read-only checks map to the major frameworks. Use it to show an auditor which controls each view can evidence."
        actions={
          <ExportButtons
            filenameBase="compliance-crosswalk"
            title="Compliance Crosswalk — control coverage"
            rows={controls}
            columns={[
              { header: "Control area", accessor: (r) => r.area },
              { header: "Meridian check", accessor: (r) => r.check.label },
              { header: "CIS Azure", accessor: (r) => r.cis },
              { header: "MCSB", accessor: (r) => r.mcsb },
              { header: "NIST 800-53", accessor: (r) => r.nist },
              { header: "ISO 27001", accessor: (r) => r.iso },
              { header: "SOC 2", accessor: (r) => r.soc2 },
              { header: "PCI DSS", accessor: (r) => r.pci },
            ]}
          />
        }
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Controls mapped" value={controls.length} />
        <StatCard label="Frameworks" value={FRAMEWORKS.length} />
        <StatCard label="Read-only" value="100%" />
        <StatCard label="Agents required" value={0} />
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Control coverage by framework</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto rounded-md border">
            <table className="w-full min-w-[880px] text-[12.5px]">
              <thead className="border-b bg-muted/50 text-[11px] uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 text-left font-semibold">Control area</th>
                  <th className="px-3 py-2 text-left font-semibold">Meridian check</th>
                  {FRAMEWORKS.map((f) => (
                    <th key={f.key} className="px-3 py-2 text-left font-semibold" title={f.full}>
                      {f.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="[&_tr]:border-b [&_tr:last-child]:border-0">
                {controls.map((c) => (
                  <tr key={c.area} className="align-top">
                    <td className="px-3 py-2 font-medium text-foreground">{c.area}</td>
                    <td className="px-3 py-2">
                      <Link
                        href={c.check.href}
                        className="inline-flex items-center gap-1 font-medium text-primary hover:underline"
                      >
                        {c.check.label}
                        <ArrowUpRight className="h-3 w-3" />
                      </Link>
                    </td>
                    {FRAMEWORKS.map((f) => (
                      <td key={f.key} className="px-3 py-2 font-mono text-[11.5px] text-muted-foreground">
                        {c[f.key]}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-wrap gap-2 text-[11px] text-muted-foreground">
        {FRAMEWORKS.map((f) => (
          <span key={f.key} className="rounded-md border bg-card/60 px-2 py-1">
            <span className="font-semibold text-foreground">{f.label}</span> — {f.full}
          </span>
        ))}
      </div>

      <Alert>
        <AlertTitle>Coverage map, not a pass/fail audit</AlertTitle>
        <AlertDescription>
          This shows which framework controls each Meridian view can evidence. The live
          pass/fail comes from running the linked check against your estate. Mappings are
          indicative — align them to your own control set before formal attestation.
        </AlertDescription>
      </Alert>
    </>
  );
}
