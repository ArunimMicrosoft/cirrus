# Deploying Meridian to Cloudflare Pages via GitHub Actions

**Meridian** — Read-only Azure visibility, built by **Arunim's IT Caffe**.

Every push to `main` builds and deploys to Cloudflare Pages. Feature branches produce preview URLs. No local wrangler CLI, no Azure resources, no persistent server storage — the app is a static Next.js export plus Cloudflare Pages Functions.

There are three moving pieces:

| Where | What | Set once? |
| --- | --- | --- |
| Cloudflare dashboard | Pages project + `SESSION_SECRET` env var | Yes |
| GitHub repo → Settings → Secrets | `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` | Yes |
| The workflow file | `.github/workflows/deploy.yml` (already committed) | Yes |

Total setup time: ~5 minutes.

---

## 0. Push this folder to a new GitHub repo

The app lives at the root of its own repo. If you haven't pushed yet:

1. On [github.com](https://github.com/new), create a new **empty** repository (no README, no `.gitignore`, no license — leave it blank). Name suggestion: `meridian`.
2. From this folder, initialise git and push:

   ```powershell
   git init
   git add .
   git commit -m "chore: initial Meridian commit"
   git branch -M main
   git remote add origin https://github.com/<your-username>/meridian.git
   git push -u origin main
   ```

3. Refresh the repo on GitHub — you should see the app tree at the root (`app/`, `functions/`, `lib/`, etc.) and the workflow file under `.github/workflows/deploy.yml`.

The workflow will fail on this first push because the Cloudflare secrets aren't set yet. Continue with steps 1–4 below, then re-run it from **Actions** → **Deploy to Cloudflare Pages** → **Run workflow**.

---

## 1. Create the Cloudflare Pages project

You only do this once. Everything after is automated by GitHub Actions.

1. Open [dash.cloudflare.com](https://dash.cloudflare.com) → **Workers & Pages** → **Create** → **Pages** → **Create a project** → **Direct Upload**.
2. Name it exactly `azure-inventory-web` (this is what the workflow deploys to). Production branch: `main`.
3. Click **Create project**. You'll be told to upload assets — just close that step, the workflow will do it.
4. Go to **Settings** → **Functions** and set:
   - **Compatibility flags** → **Production** → add `nodejs_compat`
   - **Compatibility flags** → **Preview** → add `nodejs_compat`

That's the entire Cloudflare project setup. No KV. No workers. No Azure.

> Prefer a different Pages project name? Change `--project-name=…` in `.github/workflows/deploy.yml` to match.

---

## 2. Set the session secret in Cloudflare

The Pages Functions encrypt the login session in an HttpOnly cookie using `SESSION_SECRET`. Generate a strong random value and store it as an encrypted environment variable in the Pages project.

Generate a key on your machine:

```powershell
node -e "console.log(require('crypto').randomBytes(48).toString('base64'))"
```

Then in the Cloudflare dashboard for the `azure-inventory-web` project:

1. **Settings** → **Environment variables**
2. Under **Production**, click **Add variable**:
   - Variable name: `SESSION_SECRET`
   - Value: paste the key you generated
   - **Encrypt** (click the padlock — this is important)
3. Under **Preview**, add the same variable (encrypted). You can reuse the same key or generate a separate one.
4. Save.

Rotate this value any time by generating a new key and updating both environments. Users will just need to log in again.

### Emergency: sign everyone out

If you need to invalidate every active session on demand — a suspected leak, a compromised laptop, a departing admin — you have two levers:

- **Preferred**: bump the `SESSION_EPOCH` environment variable. Set it to a new value (e.g., `1` → `2`). Every previously-issued cookie fails the epoch check on the next request and forces re-authentication. Encryption key is unchanged, so users can immediately sign back in.
- **Nuclear**: rotate `SESSION_SECRET` itself. Achieves the same outcome plus rotates the crypto material. Use if you suspect the key has leaked.

Both take effect on the very next request, no redeploy needed.

---

## 2b. (Optional) Enable "Sign in with my account"

Meridian supports two login methods:

- **Service Principal** — the deployer's users create an SP in their own Azure AD and paste tenant/client/secret. Requires Application Administrator or `az ad sp create-for-rbac` permissions.
- **Sign in with my account** — end users log in with their own Azure AD account via the OAuth 2.0 Device Code flow. Requires **no** app-registration permissions in their tenant, just Reader on the subscriptions they want to see.

Enable the second method by creating one multi-tenant app registration in **your** Azure AD (the Meridian deployer's tenant) and setting `AZURE_AD_CLIENT_ID`.

### Create the multi-tenant app registration (one-time)

1. In your Azure AD → **App registrations** → **New registration**.
2. Name it e.g. `Meridian Sign-in`. Under **Supported account types** pick **Accounts in any organizational directory (Multi-tenant)**.
3. Leave **Redirect URI** blank (Device Code flow does not use one).
4. **Register**.
5. On the app's **Authentication** blade:
   - Set **Allow public client flows** to **Yes**.
   - Save.
6. On the app's **API permissions** blade:
   - **Add a permission** → **Azure Service Management** → **Delegated permissions** → tick **user_impersonation** → **Add**.
   - Optionally grant admin consent so your own users don't see the consent prompt (first user from each other tenant will see it once).
7. Copy the **Application (client) ID** from the app's overview.

### Add the client ID to Cloudflare

Cloudflare Pages → your project → **Settings → Environment variables → Add variable**:

| Field | Value |
|---|---|
| Name | `AZURE_AD_CLIENT_ID` |
| Value | the client ID from step 7 |
| Encryption | **not required** (client IDs are public identifiers) |
| Environments | Production **and** Preview |

Redeploy so the Functions pick up the new env var.

### What end users see

- On the login screen they pick **"Sign in with my account"**.
- They see a code and a link to `microsoft.com/devicelogin`.
- They authenticate with their normal Azure AD account (MFA and conditional access still apply).
- The first user from a new tenant gets a one-time consent prompt for `user_impersonation`. Their tenant admin can pre-approve for the whole tenant if desired.

If `AZURE_AD_CLIENT_ID` isn't set, the tab still renders but the endpoint returns `501 — Device Code sign-in is not configured`. Only Service Principal login works until you set it.

---

## 3. Create a Cloudflare API token

The workflow uses this token to publish deployments.

1. In Cloudflare, click your profile (top right) → **My Profile** → **API Tokens** → **Create Token**.
2. Choose the **Edit Cloudflare Workers** template (or **Create Custom Token**).
3. Permissions required:
   - **Account** → **Cloudflare Pages** → **Edit**
   - **User** → **User Details** → **Read** (some setups need this)
4. Account resources: **Include** → your account.
5. Zone resources: **All zones** (or leave default).
6. Click **Continue to summary** → **Create Token** → **copy** the token (you can't see it again).

Also grab your **Account ID** from the right-hand rail of any dashboard page — it's under **API** or on the Workers & Pages overview.

---

## 4. Add the two secrets to GitHub

In your GitHub repo → **Settings** → **Secrets and variables** → **Actions** → **New repository secret**. Add two entries:

| Name | Value |
| --- | --- |
| `CLOUDFLARE_API_TOKEN` | the token from step 3 |
| `CLOUDFLARE_ACCOUNT_ID` | your Cloudflare account ID |

These are only used by the GitHub Actions runner. They are never exposed to the browser, never shipped in the bundle, and never seen by end users.

---

## 5. Push and deploy

The workflow at [`.github/workflows/deploy.yml`](./.github/workflows/deploy.yml) triggers on:

- Every push to `main` → production deploy (`https://azure-inventory-web.pages.dev`)
- Every push to any other branch → preview deploy at a per-branch URL
- Manual dispatch from the GitHub Actions tab

If you already did the initial push in step 0, either re-run the workflow from the **Actions** tab or push a trivial commit:

```powershell
git commit --allow-empty -m "chore: trigger CF Pages deploy"
git push
```

Watch the run in **GitHub → Actions → Deploy to Cloudflare Pages**. On success, the last step prints the deployment URL.

---

## 6. Verify

Open the deployment URL and confirm:

1. Landing page renders with a dark-mode toggle and login form.
2. Log in with your Service Principal credentials (tick **Enable Azure Lighthouse** if you're an MSP).
3. `/dashboard` populates with real numbers.
4. `/inventory/virtual-machines` shows rows and CSV/PDF export downloads.
5. `/tools/drift` lets you capture a snapshot (stored in your browser, not on any server).
6. `/tools/docs` renders without making any Azure calls.

If login fails, open the browser network tab and inspect the `POST /api/auth/login` response body — it forwards the raw Azure AD error, which is usually one of:

- Expired client secret → rotate in Azure AD
- Wrong tenant ID → check `az account show --query tenantId`
- Service Principal missing Reader role → assign it on the subscription

---

## Local development

For local iteration on the frontend or the Pages Functions, you don't need Cloudflare at all:

```powershell
npm install
npm run pages:dev
```

`pages:dev` runs `next build` then `wrangler pages dev out` on `http://localhost:8788`. Wrangler reads a local `.dev.vars` file for secrets:

```powershell
node -e "console.log('SESSION_SECRET=' + require('crypto').randomBytes(48).toString('base64'))" > .dev.vars
```

`.dev.vars` is git-ignored, never committed.

For a pure frontend loop (auth won't work but pages render):

```powershell
npm run dev
```

Runs the Next.js dev server on `http://localhost:3000`. Useful for tweaking UI without spinning up wrangler.

---

## What lives where

| Concern | Home | Notes |
| --- | --- | --- |
| Static HTML/JS | `./out` (built) | Uploaded to CF Pages CDN |
| API endpoints | `./functions/api/*` | Run in the Workers runtime |
| Session cookie key | Pages env var `SESSION_SECRET` | Set in dashboard, encrypted |
| SP credentials | Encrypted HttpOnly cookie | Client-scoped, 4 h lifetime |
| Drift snapshots | Browser IndexedDB | Per-user, per-device |
| VM prices | Workers Cache API | 24 h TTL |
| Access tokens | Workers Cache API | 1 h TTL |

There is no server-side database, no KV namespace, no Durable Object, and no Azure resource of any kind. If you tear down the CF Pages project, nothing else needs cleaning up.

---

## Custom domain

Meridian's production home is **`https://meridian.cloudcanvas.info`**, served as a subdomain of the parent `cloudcanvas.info` zone.

If you're setting up a fresh deployment on your own subdomain:

1. Cloudflare dashboard → your Pages project → **Custom domains** → **Set up a custom domain**
2. Enter the fully qualified hostname (e.g. `meridian.example.com`)
3. If the parent zone (`example.com`) is already in the same Cloudflare account, CF auto-creates the CNAME. Click **Activate domain**.
4. Universal SSL provisions the TLS cert automatically — usually within 5 minutes.

Then update `web/lib/brand.ts` so the sidebar, footer, PDF exports, and copy references your new home:

```ts
host: "meridian.example.com",
url: "https://meridian.example.com",
```

The app makes no absolute-URL assumptions in its data layer, so any hostname works without further code changes.

---

## Rollback

Cloudflare Pages keeps every deployment. Roll back from **Deployments** → pick a prior deploy → **Rollback**. Instant, no rebuild required.

---

## Cloudflare security rules — let the app's own /api/ calls through

If you added **custom security rules** on the zone (scanner blocks, Managed Challenges on app paths, bot / user-agent blocks, etc.), they can catch Meridian's own `/api/*` requests. Symptom: pages like Sign in, VM Backups, Monitor Alerts, or Resource Graph fail with "blocked by a Cloudflare security rule."

Two rule types commonly cause this:

- **Managed Challenge rules** that match app routes such as `/login` or `/dashboard`. A browser can solve a Managed Challenge for a page navigation, but a background `fetch()` to `/api/...` cannot — so the API call fails.
- **Bot / user-agent block rules** that are broader than intended and match legitimate browser requests.

### Step 1 — Confirm which rule is firing

Cloudflare dashboard → your zone → **Security → Events** (or **Analytics → Security**). Find the recent blocked/challenged request (match the Ray ID shown on the block page). It names the exact rule and the request path. This removes the guesswork.

### Step 2 — Add a high-priority "Skip" rule for /api/

Cloudflare dashboard → **Security → Security rules → Custom rules → Create rule**:

- **Rule name**: `Allow Meridian API`
- **Field / expression** — use the expression editor and paste:

  ```
  (starts_with(http.request.uri.path, "/api/"))
  ```

  Or, scoped to the host as well:

  ```
  (http.host eq "meridian.cloudcanvas.info" and starts_with(http.request.uri.path, "/api/"))
  ```

- **Action**: **Skip**
- Under Skip, tick **All remaining custom rules** (and, if offered, **Rate limiting rules** should stay ENABLED — see note).
- **Place / order**: drag this rule to **Order 1** so it evaluates before the blocking rules.
- **Deploy**.

Because Skip stops rule evaluation for matching requests, the app's own API calls sail through while every blocking rule still applies to the rest of the Internet.
`
### Step 3 — (Optional) Stop challenging /dashboard`

If your "Managed Challenge" custom rule lists `/dashboard`, that is a legitimate signed-in app route and will nag real users. Either remove `/dashboard` from that rule's expression, or rely on the Skip rule above for `/api/` and keep the challenge only on truly sensitive paths like `/admin`.

### Keep

Leave the **rate-limiting rule** on the login endpoints in place — it protects `/api/auth/login` and `/api/auth/device/poll` from brute force and is separate from the block rules. The Skip rule targets custom *block/challenge* rules, not rate limits.

After deploying the Skip rule the block clears immediately — no redeploy of the app needed.

---

## Operational notes

- **Cold-start latency**: Pages Functions warm within ~50 ms. Azure AD token minting adds ~200–400 ms on the very first request, then cached for the token's full ~1 h lifetime.
- **Concurrent requests**: the dashboard fires 8 parallel ARM queries; all of them share one cached token, no thundering herd.
- **Cost**: Cloudflare Pages Functions include 100 k requests/day free. A typical inventory session issues ~30 requests, so the free tier fits well over 3 000 sessions/day.
- **Logs**: enable **Real-time Logs** in the Pages dashboard for a live stream. The app itself never logs PII, secrets, or resource data.
