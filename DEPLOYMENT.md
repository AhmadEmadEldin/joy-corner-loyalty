# Deployment

## Neon

Create a PostgreSQL project and retain its pooled connection string as `NEON_DATABASE_URL`. The Northflank service applies every pending migration in `server/migrations/` at startup.

## Northflank web app and API

Deploy this repository as a Docker service. The included `Dockerfile` builds the React frontend and runs the Express API, which serves both surfaces from the same Northflank domain.

- Build method: repository `Dockerfile`
- Port: `3001` (HTTP, publicly exposed)
- Health check: `GET /health`
- Routine readiness probe: `GET /health` (process availability only)
- Manual database diagnostic: `GET /ready` (queries Neon and wakes its compute; do not poll it)

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

The GitHub Actions workflow exports once daily at 02:00 UTC, or on demand using Run workflow. Reports can therefore lag by a day. Configure `NEON_DATABASE_URL`, `GOOGLE_SHEET_ID`, and one server-side Google credential method. The live app never reads Google Sheets. Avoid a second recurring reporting job in Northflank.

## Staying within Neon's free compute allowance

Keep scale-to-zero enabled (five idle minutes on Free). Start with 0.25 CU for a small workload and review performance before increasing the compute limit. All active branch computes contribute to project usage. Use `/health` for uptime monitors and Northflank probes; reserve `/ready` for manual diagnostics. The app's pool already releases idle connections after 30 seconds.

Sleeping preserves the database and wakes it on the next connection. It does not replenish an exhausted monthly quota. If Neon has suspended the project for quota exhaustion, wait for the quota reset or change plans before restarting the backend. Do not repeatedly restart it: startup applies migrations and synchronizes configured staff accounts, which requires database access.

For development without using Neon hours, use a separate local PostgreSQL database: set `NEON_DATABASE_URL` in `.env.local` to its local connection string and `DATABASE_SSL=false`. Use a dedicated development database; startup applies migrations there. Run `npm run dev:full`. Restore the Neon URL and `DATABASE_SSL=true` to reconnect to Neon. This is development with a local database, not offline order capture or automatic synchronization with production.
