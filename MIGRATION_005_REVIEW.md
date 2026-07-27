# Migration 005 Safety Review

Reviewed migration: `server/migrations/005_operational_integrity.sql`

The migration has not been executed. Review and validation were performed
locally without a Neon connection.

## Safety changes

- The order-status update now targets only the four legacy values that require
  conversion. Canonical rows are not rewritten, so their `updated_at` trigger
  is not fired by this migration.
- Menu availability is backfilled only where `availability_status is null`.
  Every row updated by this statement requires a value before the column can
  become `not null`.
- Explicit preflight guards reject unknown order statuses, unknown payment
  statuses, invalid order-place values, negative fees, negative loyalty
  balances, negative voucher discounts, and duplicate non-empty payment
  reference groups.
- `order_place` is constrained to the lowercase application values:
  `dine_in`, `takeaway`, `car`, `outside`, and `delivery`.
- `service_fee`, `delivery_fee`, and voucher redemption discounts must be
  non-negative.
- `loyalty_ledger.balance_after` must be non-negative.
- The payment-reference uniqueness index is created only after a duplicate
  preflight guard provides a clear remediation error.
- Whitespace-only payment references are normalized to `null`; no payment is
  deleted, merged, or repriced.
- `image_provider` allows only `null` or `cloudinary`, matching the only
  supported external image writer.
- The migration still runs inside the migration runner's per-file transaction
  and advisory lock.

## Constraint review

| Field | Database rule |
|---|---|
| `orders.status` | Nine lowercase canonical workflow values |
| `orders.payment_status` | `unpaid`, `partially_paid`, `paid`, `refunded`, or `voided` |
| `orders.order_place` | `dine_in`, `takeaway`, `car`, `outside`, `delivery` |
| `orders.service_fee` | `>= 0` |
| `orders.delivery_fee` | `>= 0` |
| `voucher_redemptions.discount_amount` | `>= 0` |
| `loyalty_ledger.balance_after` | `>= 0` |
| `menu_items.image_provider` | `null` or `cloudinary` |
| `menu_item_sizes.price` | `> 0`, already enforced by migration 001 |
| `menu_modifiers.price` | `>= 0`, already enforced by migration 001 |
| `payments.amount` | `> 0`, already enforced by migration 001 |
| price-history values | previous `>= 0`, new `> 0` |

## Loyalty balance decision

Negative `points_delta` values are intentionally allowed because future
redemptions or administrative corrections may debit points. A negative
`balance_after` is not intentionally allowed: the account cannot spend more
points than it owns. The migration therefore constrains `balance_after >= 0`
while leaving `points_delta` signed.

If the business later decides to support loyalty overdrafts, that policy must
be explicit in both the API transaction logic and the database constraint.

## Data movement

The migration converts only:

| Existing status | Canonical status |
|---|---|
| `pending_confirmation` | `awaiting_confirmation` |
| `accepted` | `in_preparation` |
| `preparing` | `in_preparation` |
| `closed` | `picked_up` |

It does not insert synthetic `order_status_history` or `menu_price_history`
records. The new history tables begin recording real changes after deployment.

Existing `orders`, `order_items`, item-name/category/size/unit-price snapshots,
payments, and vouchers are preserved. Migration 005 adds an image URL snapshot
column but does not rewrite existing monetary snapshots. It also does not
insert synthetic audit logs, status history, price history, loyalty ledger
entries, or voucher redemptions.

The availability backfill applies only to null values:

| Existing flags | New availability |
|---|---|
| `active=false` | `archived` |
| `active=true, available=true` | `available` |
| `active=true, available=false` | `temporarily_unavailable` |

## Preflight procedure

Use a direct, unpooled connection to a disposable Neon branch first:

```powershell
psql $env:NEON_DATABASE_URL -v ON_ERROR_STOP=1 -f MIGRATION_005_PREFLIGHT.sql
```

The script begins with `begin read only`, uses only temporary reporting tables,
and ends with `rollback`. PostgreSQL therefore prevents persistent writes. A
`BLOCKED` result must be resolved before running the migration.

Then run a transactional migration dry run on the disposable branch:

```powershell
$probe = "BEGIN;`n" +
  (Get-Content server/migrations/005_operational_integrity.sql -Raw) +
  "`nROLLBACK;"
$probe | psql $env:NEON_DATABASE_URL -v ON_ERROR_STOP=1
```

## Migration runner safeguards

- Migration 005 is guarded by `MIGRATION_CONFIRM_STAGING=true`.
- `NODE_ENV=production` is rejected with no bypass.
- Hosts or database names visibly marked `prod` or `production` are rejected.
- The target must be a direct Neon hostname and must not contain `-pooler`.
- `DATABASE_SSL=false` is rejected.
- Safe logging includes only target hostname and database name.
- The runner takes an advisory lock and wraps each unapplied file in its own
  transaction.
- It stops at the first failure, records filename/checksum only after commit,
  skips matching applied migrations, and rejects changed checksums.
- The guard is evaluated only while migration 005 is unapplied. After it is
  recorded, normal production startup can verify its checksum without trying
  to reapply it.

Retry migration 005 only through `npm run migrate:neon`. Do not execute pieces
of the migration manually and then retry the runner; checksum tracking can
protect whole-file application but cannot identify arbitrary partial manual
changes.

## Remaining operational considerations

- Adding and validating constraints takes table locks. Apply during a quiet
  deployment window.
- The unique payment index cannot be created until duplicate reference groups
  are resolved.
- Status conversion is intentionally lossy: `accepted` and `preparing` merge
  into `in_preparation`.
- A Neon snapshot or temporary branch remains the only lossless rollback.
- Existing schema field names such as `closed_at` and `closed_order_count`
  remain for compatibility; they now represent `picked_up` completion.
- The staging confirmation protects explicit environment intent, while the
  production-name heuristic can only detect hosts/databases whose names expose
  a production marker. Operational verification of the Neon branch identity
  remains mandatory.
