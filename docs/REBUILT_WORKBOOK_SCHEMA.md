# Rebuilt Workbook Schema

The workbook contract is defined by `server/sheets/schema.ts`. The exact tab
order is:

1. Dashboard — materialized operational metrics only.
2. Settings — typed application settings and controlled lists.
3. Staff — Firebase UID/email, role, active state, and permission JSON; never passwords.
4. Menu — stable item/category IDs, price text, normalized sizes/extras JSON, availability, and audit fields.
5. Customers — customer master data plus backend-owned aggregates.
6. Orders — one master row per order with immutable snapshots, totals, workflow state, idempotency, device, offline, sync, and archive metadata.
7. Order Items — one line per order selection with trusted price snapshots and preparation timestamps.
8. Payments — immutable received/applied/change transactions.
9. Loyalty — typed ledger records selected by `recordType` (for example Voucher, Redeemed, or Manual Adjustment).
10. System Log — typed audit, sync, migration, end-day, and receipt-file events selected by `eventType`.

Headers must match `NORMALIZED_SHEET_HEADERS` exactly. Calculated customer
fields are backend-owned. New IDs and `clientRequestId` values must be unique.
User-controlled strings are neutralized before Sheet writes to prevent formula
injection.
