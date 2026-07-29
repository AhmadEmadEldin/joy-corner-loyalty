# Menu Source Comparison

Run date: 2026-07-29

| Source | Products | Variants / prices | Categories | Differences |
|---|---:|---:|---:|---|
| `data/menu.json` | 166 | 227 | 13 | One duplicate Sahlab identity; legacy shape |
| `data/menu.normalized.json` | 165 | 227 | 13 | Canonical validated source |
| Google Sheet Menu | 166 | 227 | 13 | 28 spelling/name differences; one duplicate; no price differences |
| Neon active menu | 165 | 227 | 13 | Matches normalized source |
| `GET /api/menu` | 165 | 227 | 13 | Archived identity excluded |
| tracked reference fixture | 166 | 227 | 13 | Development/reference only |

## Reconciliation

- The duplicate `Hot Beverages / Sahlab` records were classified as the same
  product with separate variants. They were merged into `ITEM-0037`; all six
  size/type variants and Caramel, Kinder, and Nutella extras were preserved.
- `ITEM-0039` is archived in Neon rather than deleted. Later canonical IDs were
  preserved, so normalization is deterministic on every run.
- Missing products: 0
- Unresolved duplicates: 0
- Invalid or negative prices: 0
- Orphan variants: 0
- Unexpected category/availability/image differences: 0
- Hardcoded checkout price authority: none; the API reloads Neon values

Architecture:

- Neon is the transactional menu and checkout-price source of truth.
- normalized JSON is the validated seed/import source.
- Google Sheets is staging reporting and controlled exchange.
- Cloudinary stores product image assets; Neon stores image metadata.
