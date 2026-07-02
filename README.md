# PAAG Commerce

This workspace contains two standalone projects, each with its own Git repository:

| Project | Folder | GitHub |
|---|---|---|
| **Frontend** (Next.js) | [`paag-frontend/`](paag-frontend/) | https://github.com/ogdevelpers/paag-frontend |
| **Backend** (NestJS) | [`paag-backend/`](paag-backend/) | https://github.com/ogdevelpers/paag-backend |

## Push to GitHub

Create both repos on GitHub, then run:

```bash
# Backend
cd paag-backend
git remote add origin https://github.com/ogdevelpers/paag-backend.git
git push -u origin main

# Frontend
cd ../paag-frontend
git remote add origin https://github.com/ogdevelpers/paag-frontend.git
git push -u origin main
```

## Local development

```bash
# Terminal 1 — backend
cd paag-backend
cp .env.example .env   # fill in Supabase credentials
npm install
npm run db:push && npm run db:seed
npm run dev            # http://localhost:4000

# Terminal 2 — frontend
cd paag-frontend
cp .env.example .env.local
npm install
npm run dev            # http://localhost:3000
```

## Deploy

- **Frontend** → [Vercel](https://vercel.com): import `paag-frontend`, set `API_INTERNAL_URL`
- **Backend** → [Render](https://render.com): import `paag-backend`, use `render.yaml` blueprint

See each project's README for details.
