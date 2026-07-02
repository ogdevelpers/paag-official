# PAAG Commerce

A black and gold ecommerce website for PAAG by Sakshi Gupta.

Two deployable projects:

```text
frontend/   Next.js 16 storefront (React 19, Tailwind CSS)
backend/    NestJS REST API + Prisma + Supabase PostgreSQL
```

```text
Browser → Next.js (:3000) → /api/* rewrite → NestJS (:4000) → Prisma → Supabase Postgres
                                                              → Supabase Storage (images)
```

## Quick Start

```bash
npm install
cp .env.example .env
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env.local

npm run db:push
npm run db:seed
npm run dev
```

Open `http://localhost:3000`.

Local studio admin login:

```text
Email: studio@paag.in
Password: set PAAG_STUDIO_PASSWORD in backend/.env (default dev: paag-studio-2026)
```

## Useful Commands

```bash
npm run dev              # frontend + backend together
npm run dev:frontend     # Next.js only
npm run dev:backend      # NestJS only
npm run build            # backend + frontend
npm run lint
npm run db:push
npm run db:seed
npm test                 # requires dev server on :3000
```

## Deployment

**Free hosting guide:** see [`docs/deployment-free.md`](docs/deployment-free.md) (Vercel frontend + Render backend + Supabase).

Quick summary:

1. Push repo to GitHub
2. **Render** — deploy `render.yaml` (Docker backend, free tier)
3. **Vercel** — root directory `frontend`, set `API_INTERNAL_URL` to Render URL
4. Set `FRONTEND_URL` on Render to your Vercel URL
5. Run `npm run db:push` once against production `DATABASE_URL`

Pre-flight check:

```bash
node scripts/deploy-env-check.mjs
```

### Frontend (Vercel)

1. Set project root to `frontend/`
2. `vercel.json` handles monorepo install (`cd .. && npm ci`)
3. Environment variable:
   - `API_INTERNAL_URL` — public URL of the deployed backend (e.g. `https://paag-api.onrender.com`)

The Next.js rewrite proxies browser `/api/*` calls to the backend, keeping cookies same-origin.

### Backend (Render / Railway / Fly.io / Docker)

1. Deploy with `render.yaml` or `backend/Dockerfile`
2. Set `DATABASE_URL`, Supabase vars, session secrets from `.env.example`
3. Set `FRONTEND_URL` to your storefront origin for CORS
4. Set `PORT` (Render injects this automatically)

Docker (from repo root):

```bash
docker build -f backend/Dockerfile -t paag-backend .
docker run --env-file backend/.env -p 4000:4000 paag-backend
```

After deploy, run `npm run db:push` and optionally `npm run db:seed` against production Postgres once.

## Environment

| Variable | Used by | Purpose |
|---|---|---|
| `DATABASE_URL` | Backend | Supabase PostgreSQL connection string |
| `SUPABASE_URL` | Backend | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Backend | Storage uploads |
| `SUPABASE_STORAGE_BUCKET` | Backend | Product image bucket |
| `FRONTEND_URL` | Backend | CORS allowed origin(s), comma-separated |
| `API_INTERNAL_URL` | Frontend | Rewrite target for `/api/*` |
| Session / payment / verification vars | Backend | See `.env.example` |

See `docs/architecture.md` for module boundaries.
