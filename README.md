# Joy Corner Loyalty

Production staff and customer ordering app for Joy Corner.

## Architecture

- `src/portal/`: React customer and staff portals
- `server/api.ts`: Northflank API, authentication, authorization, and realtime SSE
- `server/migrations/001_initial.sql`: Neon PostgreSQL schema
- `scripts/sync_neon_reporting.ts`: asynchronous Google Sheets reporting export
- Vercel serves only the built frontend
- Google Sheets is reporting-only and is never queried by a live request

## Local development

1. Copy `.env.example` to `.env.local` and configure a Neon development database.
2. Run `npm install`.
3. Run `npm run dev:full`.
4. Open `http://localhost:8081` for staff or `/order` for customers.

The backend applies idempotent SQL migrations on startup.

## Checks

```bash
npm run check
```

## Production

See `DEPLOYMENT.md`. Secrets belong in Neon/Northflank/Vercel configuration and must never be committed.
