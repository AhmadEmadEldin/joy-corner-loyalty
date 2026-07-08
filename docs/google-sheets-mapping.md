# Google Sheets Mapping

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
