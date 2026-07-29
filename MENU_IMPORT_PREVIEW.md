# Menu Import Preview

Run date: 2026-07-29

Result: **PASS**

Source: `data/menu.normalized.json`

| Validation | Result |
|---|---|
| JSON/schema parsing | PASS |
| Stable product IDs | PASS |
| Stable variant IDs | PASS |
| Integer minor-unit prices | PASS |
| Supported categories/statuses | PASS |
| Deterministic display order | PASS |
| Duplicate IDs or product-size pairs | PASS — none |
| Negative prices | PASS — none |
| Credential/customer data | PASS — none |
| Unresolved identities | PASS — none |

Initial staging preview:

- Canonical products: 165
- Variants / price points: 227
- Categories: 13
- Expected archive: `ITEM-0039`
- Unexpected deletions: 0
- Validation errors: 0

The preview is Owner-only and returns a digest covering additions, updates,
unchanged products, prices, variants, categories, images, availability, and
archives. Apply requires the same digest plus explicit Owner confirmation.
Writing occurs in one transaction, preserves historical snapshots, records
price history and an audit event, and archives missing identities.

The preview was applied only to the isolated staging Neon branch. See
`MENU_IMPORT_EXECUTION_REPORT.md`.
