# Deployment Checklist

## Environment variables

Frontend:

- `VITE_API_URL`
- `FRONTEND_PORT` for local development only

API:

- `NODE_ENV=production`
- `PORT` or `API_PORT`
- `FRONTEND_ORIGIN`
- `JWT_SECRET` with at least 32 random characters
- `NEON_DATABASE_URL`
- `DATABASE_POOL_SIZE`
- `DATABASE_SSL=true`
- `MIGRATION_CONFIRM_STAGING=true` only during the explicit staging migration
- optional one-time `ALLOW_MIGRATED_ACCOUNT_CLAIM`
- optional staff seed passwords

Images:

- `CLOUDINARY_CLOUD_NAME`
- `CLOUDINARY_API_KEY`
- `CLOUDINARY_API_SECRET`
- `CLOUDINARY_FOLDER`

Reporting worker:

- `NEON_DATABASE_URL`
- `GOOGLE_SHEET_ID`
- one Google service-account credential method
- `REPORTING_SYNC_BATCH_SIZE`

## Pre-deployment

- [ ] Create a Neon branch/snapshot.
- [ ] Use a direct, unpooled Neon URL for the explicit migration command.
- [ ] Confirm `NODE_ENV` is not `production` and the target is the staging branch.
- [ ] Confirm frontend origin list and API URL.
- [ ] Confirm JWT rotation/rollback procedure.
- [ ] Configure Cloudinary folder permissions and upload limits.
- [ ] Set the staging folder to `joy-corner/staging/menu-items`.
- [ ] Confirm Google Sheet headers match reporting mappings.
- [ ] Run `npm ci`.
- [ ] Run `npm run check`.
- [ ] Run `npm run migrate:neon` against staging.
- [ ] Run `npm run verify:api-workflow`.
- [ ] Run authenticated Playwright staging flow.
- [ ] Review real-data screenshots at all required breakpoints.

## Deployment

1. Deploy Northflank API with the new environment variables.
2. Confirm `/health` and `/ready`.
3. Confirm migration `005_operational_integrity.sql` appears in `schema_migrations`.
4. Deploy the Vercel `dist` output with `VITE_API_URL` targeting Northflank.
5. Start one API replica while SSE uses in-process fan-out.
6. Deploy/schedule the Google Sheets reporting worker.
7. Smoke test owner, cashier, barista, and customer sessions.
8. Upload and remove one staging product image.
9. Complete one paid and one unpaid staging order.
10. Close a staging business day and verify the outbox/Sheet row.

## Security-rule changes

There are no Firebase or Supabase security rules. Security changes are Express role middleware, current-account reload during authentication, PostgreSQL constraints/uniqueness, server-only Cloudinary signatures, HTTP-only cookies, allowed-origin checks, and idempotency constraints.

## Rollback

Frontend-only rollback:

1. Redeploy the previous Vercel artifact.
2. Keep the new API/database if the previous frontend accepts canonical API responses.

Full rollback:

1. Stop writes.
2. Restore the pre-migration Neon branch/snapshot.
3. Redeploy the previous Northflank API and worker.
4. Redeploy the previous Vercel artifact.
5. Restore previous environment variable set.
6. Invalidate affected Cloudinary assets only if image writes occurred after the snapshot.

Do not deploy the old API against migration 005 without a compatibility review; it expects legacy statuses.

## Post-deployment

- [ ] Monitor 4xx/5xx, database latency, SSE disconnects, and reporting retries.
- [ ] Confirm active queues exclude picked-up/cancelled/rejected records.
- [ ] Confirm `paid_amount=0` always displays `UNPAID`.
- [ ] Confirm historical order prices remain unchanged after a menu edit.
- [ ] Confirm Cloudinary URLs are delivered through HTTPS.
- [ ] Confirm no secret appears in the frontend bundle.
- [ ] Confirm End-of-Day counts match Neon and Google Sheets.

