# Deployment

## Neon

Create a PostgreSQL project and retain its pooled connection string as `NEON_DATABASE_URL`. The Northflank backend applies `server/migrations/001_initial.sql` at startup.

## Northflank backend

Deploy this repository as a Node.js service with:

- Build command: `npm ci && npm run lint:types`
- Start command: `npm run backend`
- Port: `3001` (HTTP, publicly exposed)
- Health check: `/health`

Required variables: `NODE_ENV=production`, `NEON_DATABASE_URL`, `JWT_SECRET`, `FRONTEND_ORIGIN`, and `PUBLIC_API_URL`.

Run one instance while using the in-process SSE event fan-out. Neon remains the durable source of truth.

## Vercel frontend

Deploy the repository with `npm run build` and output directory `dist`. Set `VITE_API_URL` to the Northflank public URL followed by `/api`.

## Google Sheets reports

Run `npm run sync:reporting` on a schedule from Northflank or GitHub Actions with `NEON_DATABASE_URL`, `GOOGLE_SHEET_ID`, and one server-side Google credential method. The live app never reads Google Sheets.
