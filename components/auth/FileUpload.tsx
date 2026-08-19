"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { UploadCloud, Loader2, FileJson, ShieldCheck } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { cn } from "@/lib/utils";
import { parseInfraFile, ParseError } from "@/lib/offline/parse";
import { offlineSubscription } from "@/lib/offline/estate";
import { offlineStore } from "@/lib/hooks/use-offline";
import { useSubscriptionStore } from "@/lib/hooks/use-subscription";

/**
 * Offline entry point: upload an ARM JSON or Terraform state file, parse it in
 * the browser, and enter File mode. Nothing is uploaded to any server.
 */
export function FileUpload() {
  const router = useRouter();
  const qc = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const handleFile = async (file: File) => {
    setError(null);
    setBusy(true);
    try {
      const text = await file.text();
      const estate = parseInfraFile(file.name, text, file.lastModified);

      offlineStore.getState().enter(estate);
      useSubscriptionStore.getState().setActive(offlineSubscription(estate));
      // Prime auth so the app shell treats us as authenticated immediately
      // (avoids an AuthGate redirect race), and refresh the subscription list.
      qc.setQueryData(["auth", "me"], { authenticated: true, type: "sp", tenantId: "file" });
      qc.invalidateQueries({ queryKey: ["subscriptions"] });

      router.push("/intelligence/topology");
    } catch (e) {
      const msg = e instanceof ParseError || e instanceof Error ? e.message : String(e);
      setError(msg);
      setBusy(false);
    }
  };

  const onPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) void handleFile(file);
  };

  return (
    <div className="space-y-4">
      <div
        role="button"
        tabIndex={0}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") inputRef.current?.click();
        }}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          const file = e.dataTransfer.files?.[0];
          if (file) void handleFile(file);
        }}
        className={cn(
          "flex cursor-pointer flex-col items-center gap-2 rounded-lg border-2 border-dashed px-4 py-8 text-center transition-colors",
          dragOver ? "border-primary bg-primary/5" : "border-border hover:border-primary/50 hover:bg-muted/40",
          busy && "pointer-events-none opacity-60",
        )}
      >
        {busy ? (
          <Loader2 className="h-7 w-7 animate-spin text-primary" />
        ) : (
          <UploadCloud className="h-7 w-7 text-muted-foreground" />
        )}
        <div className="text-sm font-medium">
          {busy ? "Parsing…" : "Drop a file here, or click to choose"}
        </div>
        <div className="flex flex-wrap items-center justify-center gap-1.5 text-[11px] text-muted-foreground">
          <FileJson className="h-3.5 w-3.5" />
          Terraform state (.tfstate), <code>terraform show -json</code>, or Azure ARM JSON
        </div>
        <input
          ref={inputRef}
          type="file"
          accept=".json,.tfstate,application/json,text/plain"
          className="hidden"
          onChange={onPick}
        />
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertTitle>Couldn&apos;t read that file</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="rounded-md border bg-card/50 p-3 text-[11px] leading-relaxed text-muted-foreground">
        <div className="mb-1 flex items-center gap-1.5 font-medium text-foreground">
          <ShieldCheck className="h-3.5 w-3.5 text-emerald-500" />
          Parsed entirely in your browser
        </div>
        The file is never uploaded. File mode powers the network and
        configuration views (topology, reachability, NSG/WAF, IPAM, inventory).
        Cost and metrics need a live connection, so those views stay disabled.
      </div>
    </div>
  );
}
