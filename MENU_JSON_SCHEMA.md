# Menu JSON Import Schema

The canonical menu-import contract is validated by
`server/menuImport.ts`. JSON files must be UTF-8 JSON without comments,
trailing commas, credentials, customer data, or environment-specific service
identifiers.

## Root

| Field | Type | Required | Rule |
|---|---|---|---|
| `version` | integer | yes | Currently `1` |
| `currency` | string | yes | `EGP` |
| `categories` | array | yes | At least one category |

## Category

| Field | Type | Required | Rule |
|---|---|---|---|
| `id` | `CAT-###` or UUID | yes | Stable and unique |
| `name` | string | yes | Supported application category |
| `displayOrder` | non-negative integer | yes | Deterministic display order |
| `products` | array | yes | May be empty |

Supported category names are defined in
`SUPPORTED_MENU_CATEGORIES` in the validator. Singular/plural legacy names are
accepted only where the existing application already uses both forms.

## Product

| Field | Type | Required | Rule |
|---|---|---|---|
| `id` | `ITEM-####` or UUID | yes | Stable and unique |
| `name` | string | yes | Unique within its category |
| `description` | string | no | Preserved verbatim after trimming |
| `displayOrder` | non-negative integer | yes | Deterministic display order |
| `availabilityStatus` | string | yes | See supported values below |
| `loyaltyEligible` | boolean | yes | Whether purchases can earn loyalty |
| `costMinor` | integer or null | no | Non-negative; never used as checkout price |
| `imageUrl` | HTTPS URL or null | no | Required when provider is Cloudinary |
| `imageProvider` | `null` or `cloudinary` | yes | No other providers supported |
| `variants` | array | yes | At least one variant |
| `extras` | array | no | Explicit stable extra records |

Supported availability values:

- `available`
- `temporarily_unavailable`
- `sold_out`
- `archived`

## Variant

| Field | Type | Required | Rule |
|---|---|---|---|
| `id` | product-prefixed canonical ID or UUID | yes | Stable and globally unique |
| `name` | string | yes | Unique within the product |
| `priceMinor` | integer | yes | Non-negative EGP minor units |
| `displayOrder` | non-negative integer | yes | Deterministic display order |

`priceMinor: 4500` means EGP 45.00. Human-scale `price` values are normalized
for preview with a warning, but they are not accepted for a confirmed import
while other validation errors remain.

## Extra

| Field | Type | Required | Rule |
|---|---|---|---|
| `id` | `EXTRA-####` or UUID | yes | Stable identifier |
| `name` | string | yes | Non-empty |
| `priceMinor` | integer | yes | Non-negative |

## Import behavior

- Invalid input produces a preview with errors and no write classifications.
- Missing products are classified as archives, never deletions.
- Existing order-item snapshots are never updated.
- A confirmed import must re-run the preview against the current database
  inside a transaction.
- The confirmed digest must match the preview digest.
- Owner confirmation and an audit event are mandatory.
- Any failed statement rolls the complete import transaction back.

The repository contains the parser, deterministic normalization, validation,
secret screening, and diff engine. Canonical IDs are stored as database
`legacy_id` values while database UUID primary keys remain internal.
