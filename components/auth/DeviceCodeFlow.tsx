"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Copy,
  ExternalLink,
  Loader2,
  RefreshCcw,
  Smartphone,
  UserRound,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Checkbox } from "@/components/ui/checkbox";
import { api, type DeviceStartResponse } from "@/lib/api-client";
import { cn } from "@/lib/utils";

type Phase = "idle" | "starting" | "waiting" | "success" | "error";

const POLL_MIN_INTERVAL = 5; // seconds

/**
 * OAuth 2.0 Device Code sign-in UI.
 *
 * 1. User clicks "Start sign-in" — we call /api/auth/device/start.
 * 2. We show the returned user_code and a link to microsoft.com/devicelogin.
 * 3. User opens the URL, enters the code, signs in with their normal Azure
 *    AD account (MFA and conditional access apply as usual).
 * 4. Meanwhile we poll /api/auth/device/poll every N seconds until success,
 *    expiry, or decline.
 */
export function DeviceCodeFlow() {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("idle");
  const [start, setStart] = useState<DeviceStartResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lighthouse, setLighthouse] = useState(false);
  const [copied, setCopied] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const pollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const countdown = useRef<ReturnType<typeof setInterval> | null>(null);

  const clearTimers = useCallback(() => {
    if (pollTimer.current) {
      clearTimeout(pollTimer.current);
      pollTimer.current = null;
    }
    if (countdown.current) {
      clearInterval(countdown.current);
      countdown.current = null;
    }
  }, []);

  useEffect(() => () => clearTimers(), [clearTimers]);

  const beginPolling = useCallback(
    (deviceCode: string, intervalSec: number) => {
      let currentInterval = Math.max(POLL_MIN_INTERVAL, intervalSec);
      const tick = async () => {
        try {
          const resp = await api.auth.devicePoll(deviceCode, lighthouse);
          if ("authenticated" in resp) {
            setPhase("success");
            clearTimers();
            router.push("/dashboard");
            return;
          }
          // Pending — schedule the next tick. Honour slow_down by adding
          // 5 seconds to the interval as recommended by RFC 8628.
          if (resp.slowDown) currentInterval += 5;
          pollTimer.current = setTimeout(tick, currentInterval * 1000);
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          clearTimers();
          setPhase("error");
          setError(message);
        }
      };
      pollTimer.current = setTimeout(tick, currentInterval * 1000);
    },
    [clearTimers, lighthouse, router],
  );

  const beginCountdown = useCallback(
    (expiresInSec: number) => {
      setSecondsLeft(expiresInSec);
      countdown.current = setInterval(() => {
        setSecondsLeft((s) => {
          if (s <= 1) {
            clearTimers();
            setPhase("error");
            setError("Sign-in code expired. Start again to generate a new one.");
            return 0;
          }
          return s - 1;
        });
      }, 1000);
    },
    [clearTimers],
  );

  const beginFlow = async () => {
    setError(null);
    setPhase("starting");
    clearTimers();
    try {
      const resp = await api.auth.deviceStart(lighthouse);
      setStart(resp);
      setPhase("waiting");
      beginCountdown(resp.expiresIn);
      beginPolling(resp.deviceCode, resp.interval);
    } catch (err) {
      setPhase("error");
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const cancel = () => {
    clearTimers();
    setPhase("idle");
    setStart(null);
    setError(null);
    setSecondsLeft(0);
  };

  const copyCode = async () => {
    if (!start?.userCode) return;
    try {
      await navigator.clipboard.writeText(start.userCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* ignore */
    }
  };

  const mmss = (s: number) => {
    const m = Math.floor(s / 60);
    const r = s % 60;
    return `${m}:${r.toString().padStart(2, "0")}`;
  };

  return (
    <div className="space-y-4">
      <div className="rounded-md border bg-muted/40 p-3 text-xs leading-relaxed text-muted-foreground">
        <div className="mb-1 flex items-center gap-1.5 font-medium text-foreground">
          <UserRound className="h-3.5 w-3.5" />
          Sign in with your Azure AD account
        </div>
        No Service Principal, no client secret, no app-registration permissions
        needed in your tenant. You'll authenticate through Microsoft's
        official sign-in page — MFA, conditional access, and your normal
        Azure AD policies all apply.
      </div>

      <label className="flex cursor-pointer items-start gap-2 rounded-md border bg-card/50 p-3 text-sm">
        <Checkbox
          checked={lighthouse}
          onChange={(e) => setLighthouse(e.currentTarget.checked)}
          className="mt-0.5"
          disabled={phase === "waiting" || phase === "starting"}
        />
        <div>
          <div className="font-medium">Include Lighthouse-delegated subscriptions</div>
          <div className="mt-0.5 text-xs text-muted-foreground">
            Adds subscriptions delegated to you via Azure Lighthouse across
            customer tenants. Leave off if you only manage your own tenant.
          </div>
        </div>
      </label>

      {phase === "idle" && (
        <Button className="w-full" onClick={beginFlow}>
          <Smartphone className="h-4 w-4" />
          Start sign-in
        </Button>
      )}

      {phase === "starting" && (
        <Button className="w-full" disabled>
          <Loader2 className="h-4 w-4 animate-spin" />
          Requesting sign-in code…
        </Button>
      )}

      {phase === "waiting" && start && (
        <div className="space-y-3 rounded-lg border bg-card p-4">
          <div className="text-[11px] font-semibold uppercase tracking-[0.13em] text-muted-foreground">
            Step 1 · Open the sign-in page
          </div>
          <a
            href={start.verificationUri}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-md border bg-background px-3 py-2 text-sm font-medium hover:bg-muted/60"
          >
            {start.verificationUri.replace(/^https?:\/\//, "")}
            <ExternalLink className="h-3.5 w-3.5" />
          </a>

          <div className="text-[11px] font-semibold uppercase tracking-[0.13em] text-muted-foreground">
            Step 2 · Enter this code
          </div>
          <div className="flex items-center gap-2">
            <div className="flex-1 rounded-md border bg-background px-4 py-3 text-center font-mono text-2xl font-bold tracking-[0.25em]">
              {start.userCode}
            </div>
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={copyCode}
              title="Copy code"
            >
              <Copy className={cn("h-4 w-4", copied && "text-success")} />
            </Button>
          </div>
          {copied && (
            <div className="text-[11px] text-success">Copied to clipboard.</div>
          )}

          <div className="flex items-center gap-2 border-t pt-3 text-[11.5px] text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Waiting for sign-in… {secondsLeft > 0 && `code expires in ${mmss(secondsLeft)}`}
          </div>

          <Button type="button" variant="ghost" size="sm" onClick={cancel} className="w-full">
            Cancel
          </Button>
        </div>
      )}

      {phase === "success" && (
        <Alert variant="success">
          <AlertTitle>Signed in</AlertTitle>
          <AlertDescription>Redirecting…</AlertDescription>
        </Alert>
      )}

      {phase === "error" && error && (
        <>
          {error.includes("AZURE_AD_CLIENT_ID") ||
          error.includes("not configured") ? (
            <Alert variant="warning">
              <AlertTitle>This sign-in method is unavailable</AlertTitle>
              <AlertDescription>
                Please use the Service Principal option, or contact your
                administrator.
              </AlertDescription>
            </Alert>
          ) : (
            <>
              <Alert variant="destructive">
                <AlertTitle>Sign-in failed</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
              </Alert>
              <Button className="w-full" variant="outline" onClick={beginFlow}>
                <RefreshCcw className="h-4 w-4" />
                Try again
              </Button>
            </>
          )}
        </>
      )}
    </div>
  );
}
