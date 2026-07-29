# Menu Import Execution Report

Run date: 2026-07-29

Result: **PASS — isolated Neon staging only**

- Source: `data/menu.normalized.json`
- Preview validation errors: 0
- Canonical active products: 165
- Active variants / price points: 227
- Active categories: 13
- Archived identities: 1 (`ITEM-0039`, merged into the canonical Sahlab product)
- Unexpected deletions: 0
- Import audit events: 1

The Owner-only apply route verified the preview digest, executed inside one
database transaction, recorded price history and an audit event, and archived
missing products instead of deleting them. `GET /api/menu` returned 165 active
products, 227 variants, and 13 categories; the archived identity was not
exposed. Customer, Owner, Cashier, and Barista screens rendered the imported
Neon menu.

Production was not contacted.
