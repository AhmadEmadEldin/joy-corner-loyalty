# Google Sheets Migration Report

## Migration Version

Prepared implementation: `sheets-normalized-runtime`.

## Workbook Access

Direct local workbook inspection/mutation was attempted through Google Sheets API. It is blocked because `.env.local` points to a service-account key file that is not present in this checkout:

`JOY_FIREBASE_SERVICE_ACCOUNT_KEY_FILE`

The deployed Firebase Function runtime has workbook access through its configured `GOOGLE_SHEET_ID` secret and default service account. The implemented migration actions are designed to run there.

## Sheets Added Or Changed By Migration Code

The migration service creates or repairs canonical headers for:

- Dashboard
- Extras
- Customers
- Orders
- Order Items
- Payments
- Unpaid Tracker
- Rewards
- Loyalty Winners
- Reward Redemptions
- Staff
- Lists
- Business Settings
- Day History
- Audit Log
- Sync Failures

## Menu Migration

The menu migration mapper seeds normalized tables from `src/joy_corner_menu_with_sizes.json`.

- The existing `Menu` tab remains the only menu source and is never replaced by bundled seed data.
- Extras are written to `Extras`.
- Legacy multi-price text such as `59 / 69 / 79` is not used as authoritative pricing.

## Reconciliation

Implemented backend reconciliation calculates customer unpaid balances from open `Unpaid Tracker` rows and updates the customer aggregate through controlled backend logic. Corrections are audited.

## Exceptions

Operational write failures are recorded in `Sync Failures`; schema inspection results are recorded in `Schema Status`.

## Formula Errors

The implemented workbook inspector reports `#NAME?`, `#REF!`, `#VALUE!`, and `#DIV/0!` errors in key tabs. Direct local formula-error verification is blocked by the missing local service-account key file.

## Automated Test Results

Added tests verify:

- Menu JSON imports into normalized categories/items/sizes.
- Size prices are numeric and not slash-delimited text.
- Deterministic item IDs and size price resolution.
- Required normalized tab definitions exist.

## Remaining External Blocker

To run the migration locally against the real workbook, restore or provide the service account JSON file referenced by `JOY_FIREBASE_SERVICE_ACCOUNT_KEY_FILE`, or set `GOOGLE_APPLICATION_CREDENTIALS` to a valid Google service account that can copy and edit the workbook.
