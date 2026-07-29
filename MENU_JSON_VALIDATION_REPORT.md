# Menu JSON Validation Report

Run date: 2026-07-29

Source: `data/menu.json`

Canonical output: `data/menu.normalized.json`

## Result

**PASS — canonical output is ready for a read-only staging preview.**

The source is valid JSON and contains no detected credential or customer-data
fields. The deterministic normalizer generated 13 categories, 165 canonical
products, 227 priced variants, and 24 product-to-flavor option associations.
Validation of the canonical output produced zero errors and zero warnings.

| Check | Result |
|---|---|
| JSON syntax and UTF-8 parsing | PASS |
| Credential-like keys or values | PASS — none detected |
| Stable canonical IDs | PASS |
| Deterministic display order | PASS |
| Integer EGP minor-unit prices | PASS |
| Negative or missing prices | PASS — none found |
| Supported availability states | PASS |
| Category/product uniqueness | PASS |
| HTTPS image validation | PASS — no image URLs supplied |
| Source price preservation | PASS — all 227 price points preserved |
| Flavor preservation | PASS — mapped as zero-price options |
| Repeat-run determinism | PASS — covered by automated test |

The validator performs no database writes. Database UUIDs remain internal;
canonical IDs are matched through `legacy_id` during preview and import.
