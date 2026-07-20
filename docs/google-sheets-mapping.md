# Google Sheets Mapping

## Active Supabase reporting path

Supabase is the source of truth. Changes to customers, orders, order items,
modifiers, payments, rewards, vouchers, redemptions, status history, and audit
logs enqueue a row in `public.integration_outbox`. The server-only
`npm run sync:reporting` worker claims bounded batches and upserts stable IDs
using mappings in `server/reporting/sheetMappings.ts`.

The worker uses bounded ID ranges, batched updates/appends, exponential retry,
and no Firebase dependency. Spreadsheet outages do not affect order commits.
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
