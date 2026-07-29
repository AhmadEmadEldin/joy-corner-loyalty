# Rollback Plan

## Before deployment

- Record the reviewed code commit and migration checksum.
- Create and independently verify a Neon restore branch/point.
- Retain the previous frontend, API, and worker artifacts.
- Export the encrypted environment-variable versions without exposing values.

## Frontend-only rollback

Redeploy the previous frontend artifact when the API/database contract remains
compatible. Verify authentication, menu, queues, and receipts.

## API or migration rollback

1. Stop API writes, worker jobs, and administrative actions.
2. Preserve the failed database branch for investigation.
3. Repoint services to the verified pre-migration restore branch.
4. Deploy the matching pre-005 API/worker/frontend artifacts.
5. Restore the matching environment configuration.
6. Start one API replica and verify row counts, migration ledger, historical
   item snapshots, payments, and a read-only receipt.
7. Reopen writes only after owner sign-off.

Do not use a generic down migration for migration 005. Its status conversion
is lossy. See `MIGRATION_005_ROLLBACK_GUIDE.md`.
