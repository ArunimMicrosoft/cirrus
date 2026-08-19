"use client";

import { FileWarning, X, Download } from "lucide-react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { offlineStore } from "@/lib/hooks/use-offline";
import { useSubscriptionStore } from "@/lib/hooks/use-subscription";
import type { ParsedEstate } from "@/lib/offline/estate";

/**
 * Persistent warning shown on every app page while a file is the data source.
 * Makes it unmistakable that the numbers are from the uploaded file, not a
 * live tenant, and stamps the "as of" time.
 */
export function OfflineBanner({ estate }: { estate: ParsedEstate }) {
  const router = useRouter();
  const qc = useQueryClient();

  const exit = () => {
    offlineStore.getState().exit();
    useSubscriptionStore.getState().reset();
    qc.clear();
    router.push("/");
  };

  const asOf = new Date(estate.capturedAt).toLocaleString();

  // Export the parsed estate as a re-importable ARM resource list (an
  // offline point-in-time snapshot the user can archive or diff later).
  const downloadSnapshot = () => {
    const value = Object.values(estate.byType).flat();
    const payload = {
      _meridian: { snapshot: true, capturedAt: estate.capturedAt, source: estate.source },
      value,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const stamp = new Date(estate.capturedAt).toISOString().slice(0, 10);
    a.href = url;
    a.download = `meridian-snapshot-${stamp}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-amber-500/30 bg-amber-500/10 px-4 py-2 text-[12px] text-amber-900 dark:text-amber-200 md:px-6">
      <FileWarning className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
      {estate.demo ? (
        <>
          <span className="font-semibold">Demo mode — sample data, not a live tenant.</span>
          <span className="text-amber-800/80 dark:text-amber-200/80">
            A randomised example estate · every figure is illustrative.
          </span>
        </>
      ) : (
        <>
          <span className="font-semibold">File mode — not live Azure data.</span>
          <span className="text-amber-800/80 dark:text-amber-200/80">
            Analysis from <span className="font-mono">{estate.fileName}</span>{" "}
            ({estate.source === "tfstate" ? "Terraform state" : "ARM JSON"}) · as of {asOf}.
          </span>
          <span className="hidden text-amber-800/70 dark:text-amber-200/70 sm:inline">
            Cost &amp; metrics need a live connection.
          </span>
        </>
      )}
      <div className="ml-auto flex items-center gap-2">
        <button
          type="button"
          onClick={downloadSnapshot}
          className="inline-flex items-center gap-1 rounded border border-amber-500/40 px-2 py-0.5 font-medium transition-colors hover:bg-amber-500/20"
          title="Download this estate as a re-importable JSON snapshot"
        >
          <Download className="h-3 w-3" />
          Snapshot
        </button>
        <button
          type="button"
          onClick={exit}
          className="inline-flex items-center gap-1 rounded border border-amber-500/40 px-2 py-0.5 font-medium transition-colors hover:bg-amber-500/20"
        >
          <X className="h-3 w-3" />
          Exit file mode
        </button>
      </div>
    </div>
  );
}
