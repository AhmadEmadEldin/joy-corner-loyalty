# Google Sheets Contract

Production is still the legacy 20-tab workbook. The rebuilt working copy is the
candidate contract and has exactly ten tabs: Dashboard, Settings, Staff, Menu,
Customers, Orders, Order Items, Payments, Loyalty, and System Log.

The authoritative headers are `NORMALIZED_SHEET_HEADERS` in
`server/sheets/schema.ts`; field ownership and controlled values are defined in
`server/sheetSchema.ts`. Do not hand-maintain a second header list here.

Core invariants:

- Staff contains no password or secret field.
- Orders has one row per `orderId`; `orderId` and `clientRequestId` are unique.
- Every Order Item references an existing Order.
- Payments are immutable received/applied/change transactions.
- Loyalty is selected by `recordType`; System Log is selected by `eventType`.
- Customer aggregates are backend-calculated.
- Menu price and availability are revalidated on the server.
- User text is formula-neutralized and phone values preserve leading zeroes.
- Reads are bounded to the configured canonical column width.

See `docs/REBUILT_WORKBOOK_SCHEMA.md` for ownership, and
`docs/DATA_RECONCILIATION.md` for the verified migrated row counts.
