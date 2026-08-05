"use client";

import { FileText, KeyRound, Radio, ShieldCheck, WrenchIcon } from "lucide-react";
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

export default function DocsPage() {
  return (
    <>
      <PageHeader
        icon={<FileText className="h-5 w-5" />}
        title="Technical Documentation"
        description="Authentication, architecture, and operational notes for this Cloudflare Pages build."
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
            Service Principal (client-credentials flow) against Azure AD.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <p>
            Sign in with three values obtained from Azure AD → App
            registrations: <strong>Tenant ID</strong>,{" "}
            <strong>Client ID</strong>, and <strong>Client Secret</strong>. The
            SP needs at minimum the <strong>Reader</strong> role on each
            subscription you want to inspect.
          </p>
          <p>
            Credentials are encrypted (AES-GCM) using{" "}
            <code className="rounded bg-muted px-1 py-0.5 text-xs">
              SESSION_SECRET
            </code>{" "}
            and stored in an HttpOnly, Secure, SameSite=Lax cookie. The browser
            never sees the plaintext secret again after login. Sessions last 8
            hours.
          </p>
          <p>
            <Badge variant="warning" className="mr-2">
              Lighthouse
            </Badge>
            Enable the checkbox on the login form to discover subscriptions
            delegated to your Service Principal across customer tenants. The
            HOME tenant is auto-detected; delegated subscriptions are marked
            with a globe icon.
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
            Cost estimates come from{" "}
            <code className="rounded bg-muted px-1 py-0.5 text-xs">
              prices.azure.com/api/retail/prices
            </code>{" "}
            — a public, free, GET-only endpoint that returns real-time
            PAYG and Reservation pricing per SKU + region. Results are cached
            for 24 hours in the Cloudflare Workers Cache API.
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
            Next.js 14 (static export) + Cloudflare Pages Functions.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <ul className="list-disc space-y-1 pl-5">
            <li>
              Frontend is a static Next.js 14 SPA served from{" "}
              <code className="text-xs">./out</code>.
            </li>
            <li>
              Backend runs entirely in Pages Functions (Workers runtime). No
              Node.js server process, no long-running compute.
            </li>
            <li>
              Azure REST API is called directly via{" "}
              <code className="text-xs">fetch()</code>; the{" "}
              <code className="text-xs">@azure/arm-*</code> SDKs are avoided to
              keep the Workers bundle small.
            </li>
            <li>
              Drift snapshots live in the browser's IndexedDB (via{" "}
              <code className="text-xs">lib/idb.ts</code>) — per-user,
              per-device, never sent to the server.
            </li>
            <li>
              PDF and CSV exports render in the browser (pdf-lib / Blob API)
              so Workers CPU budget stays low.
            </li>
          </ul>
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
