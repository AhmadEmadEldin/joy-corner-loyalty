# Google Sheets Mapping

## Active Supabase reporting path

Supabase is the source of truth. Changes to customers, orders, order items,
payments, reward accounts, vouchers, redemptions, and audit logs enqueue a row
in `public.integration_outbox`. The server-only
`npm run sync:reporting` worker claims bounded batches and upserts stable IDs
using mappings in `server/reporting/sheetMappings.ts`.

Applying the reporting migration seeds the queue with existing operational
customers, orders, items, payments, reward accounts, vouchers, and redemptions,
so the first approved worker runs populate historical data too. Historical audit
events are intentionally not backfilled.

The worker uses bounded ID ranges, batched updates/appends, exponential retry,
and no Firebase dependency. Existing rows update only the mapped columns, so
workbook formulas and manually managed columns are preserved. Missing tabs or
headers fail closed instead of creating more workbook tabs. Spreadsheet outages
do not affect order commits.
Supabase rows are archived rather than deleted; a source delete never erases a
historical spreadsheet row automatically.

## Legacy mapping

The backend keeps canonical headers in `server/googleSheetsBackend.ts` and write safety rules in `server/sheetSchema.ts`.

Required tabs:

- Dashboard
- Menu
- Customers
- Orders
- Order Items
- Payments
- Unpaid Tracker
- Rewards
- Lists
- Loyalty Winners
- Reward Redemptions
- Day History
- Audit Log
- Sync Failures

Order writes now include stable `orderId`, `receiptNumber`, and `businessDate` when the headers exist. Order line data is also written to `Order Items` with `orderItemId`, `orderId`, `menuItemId`, `size`, quantity, price, totals, notes, and preparation status.

Menu seed/update operations upsert by `itemId` and avoid duplicate rows when re-run.
