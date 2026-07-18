# Migration Plan

The migration is intentionally split into reversible gates:

1. Inspect production metadata and bounded ranges without writes.
2. Create and verify an owner-only timestamped backup.
3. Create a separate working copy and share only with the Firebase runtime service account.
4. Transform legacy rows in memory; exclude staff passwords and neutralize formula-like text.
5. Require sales/payment reconciliation and referential checks before writes.
6. Replace tabs only in the working copy, then write and format each canonical tab separately.
7. Re-read every target range and verify exact tabs, headers, row counts, totals, IDs, and item references.
8. Run code checks and authenticated acceptance tests.
9. Obtain owner approval, switch configuration, deploy, smoke test, and monitor.
10. Roll back immediately if any financial, authorization, sync, or End Day invariant fails.

`npm run workbook -- --audit` is read-only. Destructive workbook commands must
target a non-production copy, require configured service-account credentials,
and must never imply a production switch. `--switch-config` prints controlled
instructions; it does not change production automatically.
