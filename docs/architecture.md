# PAAG Commerce Architecture

## Overview

PAAG is split into **two deployable applications**:

```text
frontend/   Next.js pages, components, client stores, display helpers
backend/    NestJS API, Prisma, domain logic, Supabase integration
```

There are no shared npm packages. Display helpers (currency, promotions, catalog
filters) live in `frontend/lib/domain/`. Server-side domain logic (seed data,
types, promotions) lives in `backend/src/domain/`.

## Request Flow

```text
Browser
  → Next.js page or client fetch (/api/*)
  → Next.js rewrite → NestJS controller
  → service
  → PrismaCommerceRepository
  → Supabase PostgreSQL
```

Product images flow through Supabase Storage; metadata lives in Postgres.

## Backend Modules

| Module | Responsibility |
|---|---|
| `catalog` | Product listing, filtering, studio CRUD |
| `orders` | Checkout, studio dashboard, status updates |
| `account` | Register, sign-in, cart, wishlist, order history |
| `payments` | Razorpay/mock checkout, verify, webhooks |
| `studio` | Studio session, admin operations |
| `media` | Supabase Storage upload + streaming |
| `verification` | Email/SMS OTP via Resend/Twilio |

Controllers stay thin. Business rules live in services. Persistence lives in
`CommerceRepository` backed by Prisma (`backend/prisma/schema.prisma`).

## Persistence

Production data lives in **Supabase PostgreSQL** via Prisma. Product image bytes
live in **Supabase Storage** with searchable metadata in the `media_assets` table.

Run from repo root:

```bash
npm run db:push
npm run db:seed
```

## Auth

Two parallel session systems (HMAC-signed HTTP-only cookies):

- **Customer** — email/password, 30-day session, cart/wishlist server sync
- **Studio** — email + access key, 8-hour session, admin routes

Both are implemented in `backend/src/common/auth/` and set cookies on the API
origin. Next.js rewrites keep `/api/*` same-origin for the browser in production.

## Deployment Topology

```text
┌─────────────────┐         ┌─────────────────┐
│  frontend/      │ rewrite │  backend/       │
│  Next.js        │ ──────► │  NestJS + Prisma│
│  Vercel / CF    │  /api/* │  Railway / Docker│
└─────────────────┘         └────────┬────────┘
                                     │
                            ┌────────▼────────┐
                            │ Supabase Postgres│
                            │ + Storage        │
                            └─────────────────┘
```

| App | Scales independently? | Typical host |
|---|---|---|
| Frontend | Yes (SSR/edge) | Vercel, Cloudflare Pages |
| Backend | Yes (container/VM) | Railway, Render, Fly.io |

## Production Checklist

1. Set `API_INTERNAL_URL` on frontend to backend public URL
2. Set `FRONTEND_URL` on backend for CORS
3. Run Prisma `db push` / migrations against production Postgres
4. Configure Supabase connection pooling (PgBouncer) for serverless API deploys
5. Add CI: lint, build, API contract tests
6. Add structured logging and error tracking in NestJS
