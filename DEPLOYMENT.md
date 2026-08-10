# Deployment

## Neon

Create a PostgreSQL project and retain its pooled connection string as `NEON_DATABASE_URL`. The Northflank service applies every pending migration in `server/migrations/` at startup.

## Northflank web app and API

Deploy this repository as a Docker service. The included `Dockerfile` builds the React frontend and runs the Express API, which serves both surfaces from the same Northflank domain.

- Build method: repository `Dockerfile`
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
| `FRONTEND_ORIGIN` | `https://your-northflank-domain` | Public app origin; use the same Northflank domain |
| `GOOGLE_SHEET_ID` | `1e1z...` | Google Sheets workbook ID |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | `{...}` | Service account JSON credentials |

Do not set `VITE_API_URL` in production; the frontend uses same-origin `/api`. Run one instance while using the in-process SSE event fan-out. Neon remains the durable source of truth.

## Google Sheets reports

Run `npm run sync:reporting` on a schedule from Northflank or GitHub Actions with `NEON_DATABASE_URL`, `GOOGLE_SHEET_ID`, and one server-side Google credential method. The live app never reads Google Sheets.
