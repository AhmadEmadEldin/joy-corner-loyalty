# Menu Normalization Report

Run date: 2026-07-29

## Outcome

`data/menu.json` was normalized deterministically into
`data/menu.normalized.json`. The traceable source-to-canonical mapping is in
`data/menu.normalization-map.json`.

| Measure | Source | Canonical |
|---|---:|---:|
| Categories | 13 | 13 |
| Product records | 166 | 165 |
| Price points / variants | 227 | 227 |
| Flavor arrays | 7 | 24 product-to-flavor associations |

## Duplicate decision

Exactly one category/name identity was duplicated:
`Hot Beverages / Sahlab`.

Classification: **same product with separate variants**.

The classic row became `Classic Small`, `Classic Medium`, and `Classic Large`.
The flavored row became `Flavored Small`, `Flavored Medium`, and
`Flavored Large`. Its Caramel, Kinder, and Nutella choices were retained as
zero-price options. No source row or price was discarded.

`Sahlab Nuts` and `Sahlab Pistachio` remain distinct products because their
source names and menu identities are distinct.

## Stable identity policy

- Categories use `CAT-001` through `CAT-013`.
- Products preserve source-row IDs beginning with `ITEM-0001`. The merged
  Sahlab row retires `ITEM-0039`, so later existing IDs do not shift.
- Variants use their product ID plus a normalized semantic label.
- Reused flavor options use stable `EXTRA-####` IDs assigned by first source
  occurrence.
- Re-running the script against unchanged input produces byte-equivalent JSON.

Canonical IDs are integration identifiers, not database primary keys. Neon
continues to use UUID primary keys and stores canonical product identities in
`legacy_id`.
