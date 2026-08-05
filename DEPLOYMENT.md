# Deploying Cirrus to Cloudflare Pages via GitHub Actions

**Cirrus** — Read-only Azure visibility, built by **Arunim's IT Caffe**.

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

1. On [github.com](https://github.com/new), create a new **empty** repository (no README, no `.gitignore`, no license — leave it blank). Name suggestion: `cirrus`.
2. From this folder, initialise git and push:

   ```powershell
   git init
   git add .
   git commit -m "chore: initial Cirrus commit"
   git branch -M main
   git remote add origin https://github.com/<your-username>/cirrus.git
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

The Pages Functions encrypt the Service Principal credentials in an HttpOnly cookie using `SESSION_SECRET`. Generate a strong random value and store it as an encrypted environment variable in the Pages project.

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
| SP credentials | Encrypted HttpOnly cookie | Client-scoped, 8 h lifetime |
| Drift snapshots | Browser IndexedDB | Per-user, per-device |
| VM prices | Workers Cache API | 24 h TTL |
| Access tokens | Workers Cache API | 1 h TTL |

There is no server-side database, no KV namespace, no Durable Object, and no Azure resource of any kind. If you tear down the CF Pages project, nothing else needs cleaning up.

---

## Custom domain

Cloudflare dashboard → Pages project → **Custom domains** → **Set up a custom domain**. TLS is provisioned automatically. The app makes no absolute-URL assumptions so any hostname works.

---

## Rollback

Cloudflare Pages keeps every deployment. Roll back from **Deployments** → pick a prior deploy → **Rollback**. Instant, no rebuild required.

---

## Operational notes

- **Cold-start latency**: Pages Functions warm within ~50 ms. Azure AD token minting adds ~200–400 ms on the very first request, then cached for the token's full ~1 h lifetime.
- **Concurrent requests**: the dashboard fires 8 parallel ARM queries; all of them share one cached token, no thundering herd.
- **Cost**: Cloudflare Pages Functions include 100 k requests/day free. A typical inventory session issues ~30 requests, so the free tier fits well over 3 000 sessions/day.
- **Logs**: enable **Real-time Logs** in the Pages dashboard for a live stream. The app itself never logs PII, secrets, or resource data.
