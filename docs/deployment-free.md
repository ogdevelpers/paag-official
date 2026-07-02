# Free deployment (Vercel + Render)

Recommended **$0/month** stack for PAAG:

| App | Host | Free tier notes |
|---|---|---|
| **Frontend** (Next.js) | [Vercel](https://vercel.com) | Hobby plan, best Next.js support |
| **Backend** (NestJS) | [Render](https://render.com) | Free web service; sleeps after ~15 min idle |
| **Database + images** | [Supabase](https://supabase.com) | Already configured in this project |

```text
Browser → Vercel (storefront) → /api/* rewrite → Render (NestJS) → Supabase Postgres
```

Cookies stay same-origin because the browser only talks to your Vercel domain; Vercel proxies `/api/*` to Render.

---

## 0. Prerequisites

1. **GitHub account** — both hosts deploy from Git.
2. **Supabase project** — you already use this locally (`DATABASE_URL`, storage bucket).
3. Run the checklist:

```bash
node scripts/deploy-env-check.mjs
```

---

## 1. Push code to GitHub

From the repo root:

```bash
git init
git add .
git commit -m "Initial commit"
gh repo create paag-commerce --private --source=. --push
```

If you do not use GitHub CLI, create an empty repo on github.com and:

```bash
git remote add origin https://github.com/YOUR_USER/paag-commerce.git
git push -u origin main
```

---

## 2. Deploy the backend on Render (free)

1. Open [render.com](https://render.com) → **New** → **Blueprint**.
2. Connect your GitHub repo.
3. Render detects `render.yaml` at the repo root.
4. Set **secret** env vars when prompted:

| Variable | Value |
|---|---|
| `DATABASE_URL` | Supabase Postgres connection string |
| `SUPABASE_URL` | `https://YOUR_REF.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key |
| `FRONTEND_URL` | Temporary: `http://localhost:3000` (update after step 3) |
| `PAAG_STUDIO_PASSWORD` | Strong admin password |

Render auto-generates `PAAG_CUSTOMER_SESSION_SECRET` and `PAAG_STUDIO_SESSION_SECRET`.

5. Click **Apply**. First deploy takes ~5–10 minutes (Docker build).
6. Copy your service URL, e.g. `https://paag-api.onrender.com`.
7. Test: open `https://paag-api.onrender.com/api/products` — should return JSON.

**Free tier:** service sleeps when idle. First request after sleep may take 30–60 seconds.

### Migrate production database (once)

From your machine:

```bash
DATABASE_URL="your-production-supabase-url" npm run db:push
DATABASE_URL="your-production-supabase-url" npm run db:seed
```

---

## 3. Deploy the frontend on Vercel (free)

1. Open [vercel.com](https://vercel.com) → **Add New** → **Project**.
2. Import the same GitHub repo.
3. Configure:

| Setting | Value |
|---|---|
| **Root Directory** | `frontend` |
| **Framework Preset** | Next.js (auto) |
| **Build Command** | `npm run build` (from `vercel.json`) |
| **Install Command** | `cd .. && npm ci` (from `vercel.json`) |

4. **Environment variable** (Production):

| Name | Value |
|---|---|
| `API_INTERNAL_URL` | `https://paag-api.onrender.com` (your Render URL, no trailing slash) |

5. Deploy. Copy your Vercel URL, e.g. `https://paag-commerce.vercel.app`.

---

## 4. Link frontend ↔ backend

1. **Render** → your service → **Environment** → set:

```text
FRONTEND_URL=https://paag-commerce.vercel.app
```

(Optional, for Cashfree webhooks)

```text
API_PUBLIC_URL=https://paag-api.onrender.com
```

2. **Manual Deploy** on Render to pick up the new env.

3. **Vercel** → redeploy if you changed `API_INTERNAL_URL`.

4. Test the full flow:
   - Storefront loads on Vercel
   - Sign in / register works
   - Studio at `/studio/sign-in`
   - Checkout (mock payments if `PAAG_PAYMENT_MODE=mock`)

---

## 5. Payments in production

When ready for real payments on Render:

```text
CASHFREE_APP_ID=...
CASHFREE_SECRET_KEY=...
CASHFREE_WEBHOOK_SECRET=...
CASHFREE_ENVIRONMENT=sandbox
PAAG_PAYMENT_PROVIDER=cashfree
PAAG_PAYMENT_MODE=live
```

Cashfree webhook URL:

```text
https://paag-api.onrender.com/api/payments/webhook/cashfree
```

---

## 6. Custom domain (optional, still free on Vercel)

1. Vercel → Project → **Domains** → add `paag.in` (or your domain).
2. Update Render `FRONTEND_URL` to `https://paag.in`.
3. Point DNS as Vercel instructs.

---

## Troubleshooting

| Problem | Fix |
|---|---|
| API 502 / timeout on first load | Render free tier waking up — wait ~60s and retry |
| Sign-in cookies not sticking | `FRONTEND_URL` on Render must exactly match Vercel URL (https, no trailing slash) |
| CORS errors | Same as above; only set `FRONTEND_URL`, not multiple origins unless comma-separated |
| Images 404 | Check `SUPABASE_STORAGE_BUCKET` and service role key on Render |
| Build fails on Vercel | Root Directory must be `frontend`; install runs from monorepo root |
| Studio login fails | Set `PAAG_STUDIO_PASSWORD` on Render; use `studio@paag.in` |

---

## Alternatives

- **Backend on Railway / Fly.io** — use existing `backend/Dockerfile`; set the same env vars.
- **Both on Render** — possible, but Vercel is smoother for Next.js 16.
- **Cloudflare Pages** — frontend only; still need Render (or similar) for the NestJS API.
