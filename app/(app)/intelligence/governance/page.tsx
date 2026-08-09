"use client";

import * as React from "react";
import { ScrollText, Tags, AlertTriangle } from "lucide-react";
import { PageHeader } from "@/components/data/PageHeader";
import { NoSubscriptionState } from "@/components/data/NoSubscriptionState";
import { StatCard } from "@/components/data/StatCard";
import { AlgorithmBadge } from "@/components/data/AlgorithmBadge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useArmList } from "@/lib/hooks/use-arm";
import { useSubscriptionStore } from "@/lib/hooks/use-subscription";
import { ArmApi } from "@/lib/azure/arm";
import {
  inferNamingConvention,
  inferTaggingConvention,
  type NamedResource,
} from "@/lib/ml/convention";
import type {
  ResourceGroup,
  StorageAccount,
  VirtualMachine,
} from "@/lib/azure/types";

type Scope = "vms" | "storage" | "rgs";

export default function GovernanceIntelligencePage() {
  const activeId = useSubscriptionStore((s) => s.activeId);
  const activeName = useSubscriptionStore((s) => s.activeName);
  const [scope, setScope] = React.useState<Scope>("vms");

  const vms = useArmList<VirtualMachine>(
    "/providers/Microsoft.Compute/virtualMachines",
    ArmApi.computeVms,
  );
  const storage = useArmList<StorageAccount>(
    "/providers/Microsoft.Storage/storageAccounts",
    ArmApi.storage,
  );
  const rgs = useArmList<ResourceGroup>("/resourcegroups", ArmApi.resourceGroups);

  const resources: NamedResource[] = React.useMemo(() => {
    const pick =
      scope === "vms"
        ? vms.data?.value
        : scope === "storage"
          ? storage.data?.value
          : rgs.data?.value;
    return (pick ?? []).map((r) => ({ name: r.name, tags: r.tags }));
  }, [scope, vms.data, storage.data, rgs.data]);

  const naming = React.useMemo(() => inferNamingConvention(resources), [resources]);
  const tagging = React.useMemo(() => inferTaggingConvention(resources), [resources]);

  const loading =
    scope === "vms" ? vms.isLoading : scope === "storage" ? storage.isLoading : rgs.isLoading;

  if (!activeId) return <NoSubscriptionState />;

  return (
    <>
      <PageHeader
        icon={<ScrollText className="h-5 w-5" />}
        title="Governance Intelligence"
        description={`Learns ${activeName ?? "this subscription"}'s implicit naming and tagging conventions, then flags the outliers. No hardcoded rules — read-only.`}
        actions={
          <Select value={scope} onValueChange={(v: Scope) => setScope(v)}>
            <SelectTrigger className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="vms">Virtual Machines</SelectItem>
              <SelectItem value="storage">Storage Accounts</SelectItem>
              <SelectItem value="rgs">Resource Groups</SelectItem>
            </SelectContent>
          </Select>
        }
      />

      <AlgorithmBadge keys={["patternMining"]} />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Resources analysed" value={resources.length} loading={loading} />
        <StatCard
          label="Naming coverage"
          value={naming ? `${(naming.coverage * 100).toFixed(0)}%` : "—"}
          delta={naming ? `${naming.distinctSignatures} distinct patterns` : undefined}
          deltaTone={naming && naming.coverage > 0.8 ? "positive" : "negative"}
          loading={loading}
        />
        <StatCard
          label="Naming violations"
          value={naming?.violations.length ?? 0}
          deltaTone={(naming?.violations.length ?? 0) > 0 ? "negative" : "positive"}
          loading={loading}
        />
        <StatCard
          label="Tag compliance"
          value={tagging ? `${(tagging.compliance * 100).toFixed(0)}%` : "—"}
          deltaTone={tagging && tagging.compliance > 0.8 ? "positive" : "negative"}
          loading={loading}
        />
      </div>

      {!loading && resources.length < 5 && (
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Not enough resources to infer a convention</AlertTitle>
          <AlertDescription>
            Convention inference needs at least 5 resources of the selected
            type. Pick a type with more instances.
          </AlertDescription>
        </Alert>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Naming */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-semibold">
              <ScrollText className="h-4 w-4 text-primary" />
              Naming convention
            </CardTitle>
          </CardHeader>
          <CardContent className="pb-4">
            {naming ? (
              <>
                <div className="mb-3 rounded-md border bg-card/60 p-3">
                  <div className="text-[11px] uppercase tracking-wider text-muted-foreground">
                    Inferred pattern
                  </div>
                  <div className="mt-1 font-mono text-lg">{naming.patternHint}</div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {(naming.coverage * 100).toFixed(0)}% of resources follow this ·{" "}
                    signature <span className="font-mono">{naming.dominant}</span>
                  </div>
                </div>
                {naming.violations.length > 0 ? (
                  <>
                    <div className="mb-1.5 text-xs font-medium text-muted-foreground">
                      Non-conforming names ({naming.violations.length})
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {naming.violations.slice(0, 40).map((v) => (
                        <span key={v} className="rounded border bg-destructive/10 px-1.5 py-0.5 font-mono text-[10.5px] text-destructive">
                          {v}
                        </span>
                      ))}
                    </div>
                  </>
                ) : (
                  <p className="text-sm text-success">Every name matches the inferred pattern.</p>
                )}
              </>
            ) : (
              <p className="text-sm text-muted-foreground">
                {loading ? "Analysing…" : "Not enough data."}
              </p>
            )}
          </CardContent>
        </Card>

        {/* Tagging */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-semibold">
              <Tags className="h-4 w-4 text-primary" />
              Tagging convention
            </CardTitle>
          </CardHeader>
          <CardContent className="pb-4">
            {tagging && tagging.expectedKeys.length > 0 ? (
              <>
                <div className="mb-3">
                  <div className="mb-1.5 text-[11px] uppercase tracking-wider text-muted-foreground">
                    Expected tag keys (present on the majority)
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {tagging.expectedKeys.map((k) => (
                      <span key={k.key} className="inline-flex items-center gap-1 rounded border bg-primary/10 px-1.5 py-0.5 font-mono text-[10.5px] text-primary">
                        {k.key}
                        <span className="text-muted-foreground">{(k.prevalence * 100).toFixed(0)}%</span>
                      </span>
                    ))}
                  </div>
                </div>
                {tagging.violations.length > 0 ? (
                  <>
                    <div className="mb-1.5 text-xs font-medium text-muted-foreground">
                      Missing expected tags ({tagging.violations.length})
                    </div>
                    <ul className="space-y-1.5">
                      {tagging.violations.slice(0, 20).map((v) => (
                        <li key={v.name} className="flex items-center gap-2 rounded-md border bg-card/60 px-2.5 py-1.5 text-xs">
                          <span className="font-mono">{v.name}</span>
                          <span className="ml-auto flex flex-wrap gap-1">
                            {v.missing.map((m) => (
                              <Badge key={m} variant="warning">{m}</Badge>
                            ))}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </>
                ) : (
                  <p className="text-sm text-success">All resources carry the expected tags.</p>
                )}
              </>
            ) : (
              <p className="text-sm text-muted-foreground">
                {loading ? "Analysing…" : "No dominant tag keys — this resource type is largely untagged."}
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
