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
- The migration still runs inside the migration runner's per-file transaction
  and advisory lock.

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

The script creates a temporary report table inside a transaction and ends with
`rollback`; it does not persist data. A `BLOCKED` result must be resolved before
running the migration.

Then run a transactional migration dry run on the disposable branch:

```powershell
$probe = "BEGIN;`n" +
  (Get-Content server/migrations/005_operational_integrity.sql -Raw) +
  "`nROLLBACK;"
$probe | psql $env:NEON_DATABASE_URL -v ON_ERROR_STOP=1
```

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
