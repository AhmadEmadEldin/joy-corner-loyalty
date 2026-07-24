# Deployment

## Neon

Create a PostgreSQL project and retain its pooled connection string as `NEON_DATABASE_URL`. The Northflank backend applies `server/migrations/001_initial.sql` through `003_end_day_details.sql` at startup.

## Northflank backend

Deploy this repository as a Node.js service with:

- Build command: `npm ci && npm run lint:types`
- Start command: `npm run backend`
- Port: `3001` (HTTP, publicly exposed)
- Health check: `GET /health`
- Readiness check: `GET /ready`

Required variables:

| Variable | Example | Description |
|---|---|---|
| `NODE_ENV` | `production` | Must be `production` in Northflank |
| `PORT` | `3001` | Server listen port |
| `NEON_DATABASE_URL` | `postgresql://...` | Pooled Neon connection string |
| `DATABASE_POOL_SIZE` | `5` | Maximum pool connections |
| `DATABASE_SSL` | `true` | Enable SSL (Neon requires it) |
| `JWT_SECRET` | `>=32 random chars` | Token signing secret |
| `FRONTEND_ORIGIN` | `https://joy-corner.vercel.app` | Allowed CORS origin |
| `GOOGLE_SHEET_ID` | `1e1z...` | Google Sheets workbook ID |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | `{...}` | Service account JSON credentials |

Run one instance while using the in-process SSE event fan-out. Neon remains the durable source of truth.

## Vercel frontend

Deploy the repository with `npm run build` and output directory `dist`. Set `VITE_API_URL` to the Northflank public URL followed by `/api`.

## Google Sheets reports

Run `npm run sync:reporting` on a schedule from Northflank or GitHub Actions with `NEON_DATABASE_URL`, `GOOGLE_SHEET_ID`, and one server-side Google credential method. The live app never reads Google Sheets.
