This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:4000](http://localhost:4000) with your browser to see the result.

You can start editing the page by modifying `app/route.ts`. The page auto-updates as you edit the file.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deployment

The backend deploys to **Railway**, not Vercel: it is a persistent Node server rather than
a serverless function, and its reminder sweep is driven by a Railway Cron Job instead of an
in-process timer. `BACKEND_BUILD_PLAN.md` §12 and §13 record that decision and its
rationale — treat them as the source of truth over this summary.

- **Start command:** `npm run build && npm start` — `npm start` runs `scripts/start.js`, which
  listens on the host's `PORT` (Railway assigns one dynamically) and falls back to `4000`
  locally. See `backend/railway.json`.
- **Health check:** `GET /api/health` (unauthenticated; reports MongoDB connectivity)
- **Cron Job:** `POST /api/cron/process-reminders` with `Authorization: Bearer <CRON_SECRET>`
- **Database:** a managed MongoDB (MongoDB Atlas, or Railway's MongoDB plugin) — its
  automated backups cover the payment history

The Railway service's **Root Directory must be `backend/`** — that is where
`railway.json` and `package.json` live, and Railway reads `railway.json` from the service
root. `railway.json` pins the start command to `npm start` and the health check to
`/api/health`; both can equally be set in the Railway dashboard instead.

Environment variables are documented in `backend/.env.example`; set them as Railway service
variables. The frontend's production origin must be listed in `CORS_ORIGIN`, and
`FRONTEND_URL` must be the frontend's public base URL (it is used to build
password-reset links). The frontend itself is deployed to Vercel — see the Deployment
section of the repository README.

## API Routes

This directory contains example API routes for the headless API app.

For more details, see [route.js file convention](https://nextjs.org/docs/app/api-reference/file-conventions/route).
