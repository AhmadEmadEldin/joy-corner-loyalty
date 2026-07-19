# Production Switch Checklist

- [ ] Owner reviews the rebuilt working copy and all 151 exceptions.
- [ ] Resolve or formally accept the 67 orphan payments and 51 menu uncertainties.
- [ ] Remove public writer access from production and the future production copy.
- [ ] Rotate all legacy staff passwords in Firebase Auth; confirm no Sheet password column remains.
- [ ] Run `npm run check` from a clean checkout.
- [ ] Complete authenticated owner, manager, cashier, waiter, barista, and customer tests.
- [ ] Test create order, partial/cash payment, change, preparation transitions, voucher generation/redemption, offline replay, and End Day idempotency.
- [ ] Re-run live tab/header/count/financial reconciliation immediately before cutover.
- [ ] Record current production Sheet ID and deployed version for rollback.
- [ ] Approve a maintenance window and stop writes to the old workbook.
- [ ] Change the runtime Sheet ID to the rebuilt copy and deploy.
- [ ] Perform smoke tests and compare first live writes against the ten-tab schema.
- [ ] Monitor System Log, Firebase Functions, and the owner Sync Center.
- [ ] Keep the old production workbook and backup read-only through the rollback window.

The migration tooling does not perform this checklist or switch production
automatically.
