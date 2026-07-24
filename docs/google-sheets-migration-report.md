# Google Sheets Migration Report

## Migration Version

Prepared implementation: `sheets-normalized-runtime`.

## Workbook Access

Direct workbook inspection/mutation is performed through the Google Sheets API using the service account configured via `GOOGLE_SERVICE_ACCOUNT_JSON` and `GOOGLE_SHEET_ID` environment variables on the Northflank backend.

## Sheets Added Or Changed By Migration Code

The migration service creates or repairs canonical headers for:

- Dashboard
- Menu Categories
- Menu Items
- Menu Item Sizes
- Menu Item Flavors
- Extras
- Customers
- Orders
- Order Items
- Order Item Extras
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
- Migration Exceptions

## Menu Migration

The menu migration mapper seeds normalized tables from `src/joy_corner_menu_with_sizes.json`.

- Menu categories are written to `Menu Categories`.
- Menu items are written to `Menu Items`.
- Size-specific numeric prices are written to `Menu Item Sizes`.
- Flavors are written to `Menu Item Flavors`.
- Extras are written to `Extras`.
- Legacy multi-price text such as `59 / 69 / 79` is not used as authoritative pricing.

## Reconciliation

Implemented backend reconciliation calculates customer unpaid balances from open `Unpaid Tracker` rows and updates the customer aggregate through controlled backend logic. Corrections are audited.

## Exceptions

The migration creates `Migration Exceptions` for unresolved legacy records.

## Formula Errors

The implemented workbook inspector reports `#NAME?`, `#REF!`, `#VALUE!`, and `#DIV/0!` errors in key tabs.

## Automated Test Results

Added tests verify:

- Menu JSON imports into normalized categories/items/sizes.
- Size prices are numeric and not slash-delimited text.
- Deterministic item IDs and size price resolution.
- Required normalized tab definitions exist.
