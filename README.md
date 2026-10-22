# Plaza OS

Plaza management app with two roles: **Admin** and **Tenant**. See `PRODUCT.md` for the full feature scope before working on anything here — both human contributors and coding agents should read it first.

## Stack

- `frontend/` — React (Vite), Tailwind CSS, React Router
- `backend/` — Next.js (API routes only), MongoDB

## Getting Started

```bash
git clone <repo-url>
cd plazaOS

# frontend
cd frontend
npm install
cp .env.example .env      # set VITE_API_BASE_URL
npm run dev

# backend (separate terminal)
cd backend
npm install
cp .env.example .env
npm run dev
```

## Deployment

The two halves deploy to **different** platforms:

| Component | Platform | Root Directory | Build / start |
| --- | --- | --- | --- |
| `frontend/` | **Vercel** (static hosting) | `frontend` | `npm run build` → `frontend/dist` (`frontend/vercel.json`) |
| `backend/` | **Railway** (long-running Node process) | `backend` | `npm run build && npm start` → `next start -p $PORT` |

The backend runs on **Railway, not Vercel**: it is a persistent Node server rather than a
serverless function, and its reminder sweep is driven by a Railway Cron Job instead of an
in-process timer. `BACKEND_BUILD_PLAN.md` §12 and §13 record that decision and its
rationale — treat them as the source of truth over this summary.

The halves are wired together by environment variables set on each platform:

- **Frontend (Vercel):** `VITE_API_BASE_URL` = the Railway API's public URL + `/api`
  (e.g. `https://plaza-os-api.up.railway.app/api`). The frontend build **fails** when this
  is missing or empty, so set it on the Vercel project before the first deployment.
- **Backend (Railway):** `CORS_ORIGIN` = comma-separated allow-list of browser origins
  allowed to call the API — the local Vite dev origin plus the Vercel frontend's production
  origin (never `*`); `FRONTEND_URL` = the frontend's public base URL, used to build
  password-reset links.

Also provisioned on Railway: a **Cron Job** that `POST`s `/api/cron/process-reminders`
with `Authorization: Bearer <CRON_SECRET>` on the desired cadence, and a managed MongoDB
(Atlas, or Railway's MongoDB plugin) whose automated backups cover the payment history.
The health check targets `GET /api/health` (unauthenticated; reports MongoDB connectivity),
and `npm start` binds the host-assigned `PORT`, falling back to `4000` locally.

Never commit a `.env` file — only `.env.example` is tracked.

## Folder Structure

```
frontend/
  src/
    components/       shared UI kit (Button, Card, StatusBadge, Input, Modal, Table)
    context/          AuthContext and other app-wide state
    routes/
      admin/          admin-only screens
      tenant/         tenant-only screens
    lib/              API client and utilities
backend/
  src/app/api/        Next.js API routes
```

Do not build role-specific screens outside `routes/admin` or `routes/tenant`. Do not duplicate shared components inside a role folder — if something is needed by both roles, it belongs in `components/`.

## Design System

Full palette, typography, spacing, and component rules live in the shared design guide (`DESIGN.md` if included in this repo, or ask in the team channel for the latest PDF). Key rules:

- Use only the colors, fonts, and spacing values defined in `frontend/tailwind.config.js` — no hardcoded hex codes or arbitrary pixel values
- Status is always paired with a label or icon, never shown by color alone
- Font is Inter throughout
- Minimum tap target size is 44x44px

## Branching & Workflow

- `main` is protected — no direct pushes, everything goes through a PR
- Branch naming: `feature/<short-description>`, e.g. `feature/admin-units`, `feature/tenant-payments`
- Commit in small, logical chunks with conventional commit messages (`feat:`, `fix:`, `setup:`, `chore:`)
- Every PR needs at least one review before merging, including between just two contributors

## Build Order

1. **Foundation (build once, shared by everyone):** project setup, Tailwind config, shared UI kit, auth + protected routing, shared app shell. This must be merged to `main` before any role-specific work starts.
2. **Admin routes and Tenant routes** are then built independently by different contributors, on top of the shared foundation. See `PRODUCT.md` for the full route map.

If you're an AI coding agent working in this repo: read `PRODUCT.md` fully before generating code, follow the folder structure above exactly, use only the design tokens in `frontend/tailwind.config.js`, and do not introduce new roles, routes, or features beyond what `PRODUCT.md` describes. If something is ambiguous, leave a `TODO` comment rather than guessing.

## Contributors

- Backend: 3 contributors
- Frontend: 2 contributors
