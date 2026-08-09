"use client";

import { FileText, KeyRound, Radio, ShieldCheck, WrenchIcon, Sigma } from "lucide-react";
import { PageHeader } from "@/components/data/PageHeader";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { ALGORITHMS } from "@/lib/algorithms";

export default function DocsPage() {
  return (
    <>
      <PageHeader
        icon={<FileText className="h-5 w-5" />}
        title="Technical Documentation"
        description="Authentication, the read-only model, live pricing, and the intelligence algorithms."
      />

      <Alert>
        <ShieldCheck className="h-4 w-4" />
        <AlertTitle>Read-only guarantee</AlertTitle>
        <AlertDescription>
          The app only calls Azure Resource Manager with GET methods (or POST
          for query-only endpoints like Resource Graph). No create, update, or
          delete calls exist in the codebase — the ARM proxy hard-rejects any
          HTTP method other than GET.
        </AlertDescription>
      </Alert>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <KeyRound className="h-4 w-4 text-primary" />
            <CardTitle className="text-base">Authentication</CardTitle>
          </div>
          <CardDescription>
            Service Principal (client-credentials) or your own Azure AD account.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <p>
            Sign in with a Service Principal (<strong>Tenant ID</strong>,{" "}
            <strong>Client ID</strong>, <strong>Client Secret</strong>) or,
            where enabled, with your own Azure AD account. Either way the
            identity needs at minimum the <strong>Reader</strong> role on each
            subscription you inspect.
          </p>
          <p>
            Credentials are encrypted with authenticated encryption and stored
            in an HttpOnly, Secure, SameSite=Lax cookie. The browser never sees
            the plaintext secret again after login. Sessions last 8 hours and
            can be revoked centrally at any time.
          </p>
          <p>
            <Badge variant="warning" className="mr-2">
              Lighthouse
            </Badge>
            Enable the checkbox on the login form to discover subscriptions
            delegated to you across customer tenants. The HOME tenant is
            auto-detected; delegated subscriptions are marked with a globe icon.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Radio className="h-4 w-4 text-primary" />
            <CardTitle className="text-base">Live pricing</CardTitle>
          </div>
          <CardDescription>
            Powered by the Azure Retail Prices API (no auth required).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <p>
            Cost estimates come from Microsoft&apos;s public Azure Retail
            Prices API — a free, GET-only endpoint that returns real-time PAYG
            and Reservation pricing per SKU and region. Results are cached
            briefly at the edge to avoid redundant calls.
          </p>
          <p>
            Every cost cell is tagged with a source indicator: 📡 live from the
            API, 📊 estimated from the fallback rate card when the API is
            unreachable. The mix per page is shown at the top so you always
            know how accurate a report is.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <WrenchIcon className="h-4 w-4 text-primary" />
            <CardTitle className="text-base">Architecture</CardTitle>
          </div>
          <CardDescription>
            Static single-page app + stateless serverless functions.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <ul className="list-disc space-y-1 pl-5">
            <li>
              The frontend is a static single-page app served from a global
              edge network — no origin server to reach.
            </li>
            <li>
              The backend is a small set of stateless serverless functions.
              No always-on server, no long-running compute, nothing to patch.
            </li>
            <li>
              Azure REST APIs are called through a read-only proxy that rejects
              every HTTP verb except GET before any request leaves the app.
            </li>
            <li>
              Drift snapshots and intelligence baselines live in your
              browser&apos;s local storage — per-user, per-device, never sent
              to a server.
            </li>
            <li>
              PDF and CSV exports render entirely in the browser, so no report
              data touches the backend.
            </li>
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Sigma className="h-4 w-4 text-primary" />
            <CardTitle className="text-base">Intelligence algorithms</CardTitle>
          </div>
          <CardDescription>
            Every signal is a named, auditable technique — no AI, no external
            inference, all computed in your browser.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          {Object.values(ALGORITHMS).map((a) => (
            <div key={a.name} className="flex items-baseline gap-3 border-b pb-2 last:border-0 last:pb-0">
              <span className="w-40 shrink-0 font-mono text-[12px] font-medium text-foreground">
                {a.name}
              </span>
              <span className="text-[13px] text-muted-foreground">{a.role}</span>
              <span className="ml-auto shrink-0 rounded border px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">
                {a.field}
              </span>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">What ships today</CardTitle>
          <CardDescription>
            All 22 views are wired end-to-end against Azure Resource Manager.
          </CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Inventory (5), Networking (4), Cost &amp; Optimization (6), Security
          &amp; Compliance (4), Monitoring (3), Tools (3). Every view exports
          CSV and a branded PDF. Every ARM call passes through the GET-only
          proxy.
        </CardContent>
      </Card>
    </>
  );
}
