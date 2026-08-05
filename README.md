# Cirrus — Read-only Azure visibility

**Cirrus** is a read-only Azure inventory, cost intelligence, and compliance reporting tool that runs on **Cloudflare Pages** (static Next.js frontend + Pages Functions backend). Sign in with a Reader-role Service Principal and every subscription in your tenant is at your fingertips — VMs, costs, security posture, drift, all read-only.

**Built by [Arunim's IT Caffe](#)** · Deployed with GitHub Actions.

**Deployment:** see [DEPLOYMENT.md](./DEPLOYMENT.md).

---

## What ships today

- Service Principal auth (Azure AD client-credentials flow) with AES-GCM encrypted HttpOnly session cookies
- Azure Lighthouse multi-tenant discovery (HOME vs delegated indicators), full pagination across the ARM `/subscriptions` endpoint
- Modern app shell with sidebar, top bar, and a prominent READ-ONLY badge always visible
- **All 22 views** working end-to-end — inventory, cost, security, networking, monitoring, and tools
- Live Azure Retail Prices API for VM PAYG + 1-Yr / 3-Yr Reserved Instance costs (cached 24 h via Workers Cache API)
- Client-side CSV + **branded PDF export** on every view (Cirrus wordmark, READ-ONLY watermark, "Built by Arunim's IT Caffe" footer credit)
- CIS / STIG hardening classifier for every Virtual Machine
- Cloud Drift Detector snapshots stored in the browser's IndexedDB (per-user, per-device — never leaves your machine)
- Zero write operations. The ARM proxy hard-rejects every HTTP method except GET

---

## Tech stack

| Layer | Choice | Why |
| --- | --- | --- |
| Frontend | Next.js 14 App Router with `output: 'export'` | Static SPA; deploys to CF Pages verbatim |
| Styling | Tailwind CSS 3 + shadcn-style primitives (Radix UI) | Consistent, themable, accessible |
| Data | TanStack Query + Zustand | Async server state + client-side subscription state |
| Charts | Recharts | Interactive line/bar charts for metrics |
| PDF export | pdf-lib | Runs in the browser, no Workers CPU spent |
| Backend | Cloudflare Pages Functions (Workers runtime) | No servers, no cold-start VMs |
| Azure calls | Raw `fetch()` to ARM + Retail Prices | Small bundle, no `@azure/arm-*` deps |
| Session storage | AES-GCM encrypted HttpOnly cookie | SP creds never sent to browser JS |
| Drift snapshots | Browser IndexedDB (`lib/idb.ts`) | Per-user, per-device — never leaves the browser |

No server-side database, no KV namespace, no Durable Object, no Redis, no S3, no Azure resource of any kind.

---

## Getting started (local dev)

### 1. Install

```powershell
npm install
```

### 2. Generate a local session key

```powershell
node -e "console.log('SESSION_SECRET=' + require('crypto').randomBytes(48).toString('base64'))" > .dev.vars
```

`.dev.vars` is gitignored.

### 3. Run

```powershell
npm run pages:dev
```

Builds Next.js to `./out` and serves it plus the `functions/` directory via `wrangler pages dev` on **`http://localhost:8788`**.

⚠️ **Do not use `npm run dev` for anything that hits `/api/*`.** That script runs the Next.js dev server on port 3000, which does *not* execute the Pages Functions in `./functions`. Any request to `/api/auth/login` etc. will 404.

### 4. Log in

Create a Service Principal with `Reader` on every subscription:

```powershell
az ad sp create-for-rbac --name "cirrus-inventory" `
  --role Reader `
  --scopes /subscriptions/YOUR_SUBSCRIPTION_ID
```

Paste `tenant`, `appId`, and `password` into the login form. Tick **Enable Azure Lighthouse** if you're an MSP with delegated customer subscriptions.

---

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Next.js dev server on `:3000` (UI only) |
| `npm run pages:dev` | Full CF Pages simulation on `:8788` |
| `npm run build` | Static export → `./out` |
| `npm run typecheck` | `tsc --noEmit` across the whole tree |
| `npm run lint` | `next lint` |

Deployment happens through GitHub Actions on push to `main`. See [DEPLOYMENT.md](./DEPLOYMENT.md).

---

## Read-only guarantee

Four defensive layers combine to make it architecturally impossible for Cirrus to mutate Azure:

1. **ARM proxy** (`functions/api/arm/[subscriptionId]/[[path]].ts`) hard-rejects every HTTP verb except GET with a 405.
2. **Resource Graph** (`functions/api/graph.ts`) uses POST but the endpoint is a query-only Kusto engine — KQL has no INSERT / UPDATE / DELETE primitives.
3. **Retail Prices** (`functions/api/prices/vm.ts`) is GET-only and hits Microsoft's public no-auth API.
4. **Drift snapshots** live in the user's browser IndexedDB — no server-side snapshot storage anywhere.

No `@azure/arm-*` SDK that supports write operations is imported anywhere. Every call in `lib/azure/*.ts` is `armList()` / `armFetch()` / `fetchPrices()`.

---

## Persistence model

| Data | Where | Lifetime |
| --- | --- | --- |
| SP credentials | Encrypted HttpOnly cookie (browser) | 8 h |
| Active subscription | Zustand + localStorage (browser) | Until logout |
| VM prices | Workers Cache API | 24 h |
| ARM access token | Workers Cache API | ~1 h (Azure AD token lifetime) |
| Drift snapshots | Browser IndexedDB | Until user clears site data |
| Everything else | Nothing — fetched fresh from Azure per request | — |

---

## Credit

**Cirrus** is built by **Arunim's IT Caffe**.
