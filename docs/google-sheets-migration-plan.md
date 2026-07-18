# Google Sheets Migration Plan

## Current Access Status

- Repository branch: `feature/google-sheets-normalized-backend`.
- Workbook ID: `1e1z1pfNArVzaZs5FE4k0e3JqIlwJIPG_aWH4Fziqnl8`.
- Local direct Google API inspection is blocked because `.env.local` points `JOY_FIREBASE_SERVICE_ACCOUNT_KEY_FILE` at a missing key file. The deployed Firebase Function can access the workbook through its runtime identity and `GOOGLE_SHEET_ID` secret.

## Target Workbook Hierarchy

The migration creates or repairs:

This historical plan is superseded by `LIVE_SHEET_SCHEMA.md`. The application uses the twenty tabs that already exist in the production workbook and does not create separate menu category, item, size, flavor, extra, or migration-exception tabs.

## Migration Strategy

1. Create a Drive backup copy before any workbook mutation.
2. Record a migration version in Business Settings using a timestamped key.
3. Preserve old tab contents. Existing tabs are not deleted.
4. Create missing normalized tabs and append missing canonical columns.
5. Seed normalized menu tables from `src/joy_corner_menu_with_sizes.json`.
6. Parse size prices from each live `Menu` row and validate the selected option server-side.
7. Migrate customer profile fields into the canonical Customers columns.
8. Convert legacy Orders rows into one Orders row per receipt/order and one Order Items row per product line where evidence is sufficient.
9. Record operational failures in `Sync Failures` and schema checks in `Schema Status`.
10. Reconcile unpaid balances from Unpaid Tracker rows back to Customers.
11. Remove unsupported core formulas by writing backend-managed winner rows.
12. Write Audit Log rows for backup, migration, menu seed, reconciliation, and exceptions.

## Safety Rules

- Do not use visible row numbers as permanent IDs.
- Do not hard-delete financial rows.
- Do not overwrite legacy tabs before a successful backup.
- Do not guess payment/order relationships where no stable evidence exists.
- Use idempotent upserts keyed by stable IDs.
- Return a blocked response rather than success if any required parent or child write fails.

## Verification

After migration, verify:

- Normalized tabs exist with canonical headers.
- Live Menu price text is parsed into validated numeric options.
- No duplicate stable IDs exist in normalized tabs.
- Orders reference Customers by `Customer ID`.
- Order Items reference the master Orders row and the live Menu item ID.
- Payments reference Orders when a safe relationship exists.
- Customer unpaid balances match open Unpaid Tracker records.
- Key tabs contain no `#NAME?`, `#REF!`, `#VALUE!`, or `#DIV/0!` errors.

## Rollback

Use the migration backup copy created by the `backupSheetsWorkbook` action. Because legacy tabs are preserved, rollback can also be performed by disabling normalized read paths and restoring the pre-migration workbook copy.
