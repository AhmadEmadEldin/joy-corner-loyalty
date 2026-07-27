# Migration 005 Rollback Guide

Migration 005 is transactional while it is being applied. If any statement
fails, the project migration runner rolls the entire file back automatically.

After a successful commit, rollback is not lossless. Create a Neon branch or
snapshot immediately before applying the migration.

## Approved rollback preparation

### 1. Create the isolated staging branch

In the Neon project console, create a new branch from the intended source
branch and name it clearly, for example `staging-migration-005`. Record the
Neon project ID, source branch ID, staging branch ID, database name, creation
time, and responsible operator in the deployment ticket. Configure only the
staging services with that branch's direct connection string.

Confirm that the staging endpoint differs from production before continuing.
Do not infer branch identity only from the database name.

### 2. Create the immediate pre-migration restore point

After staging data has been refreshed and writes have been paused, create a
child branch or point-in-time restore branch from staging. Use a timestamped
name such as `staging-pre-005-YYYYMMDD-HHMM`. Do this immediately before the
preflight and migration so the restore point contains no unrelated drift.

### 3. Verify the restore point

Using read-only queries against both staging and the restore point, compare:

- latest applied `schema_migrations` filename/checksum;
- row counts for orders, order items, payments, vouchers, menu items, and
  customers;
- maximum `created_at` and `updated_at` timestamps;
- order totals and payment totals;
- a small sample of historical order-item snapshots.

Record branch IDs and query results. Do not apply migration 005 until the
restore point is independently reachable.

## Restore after a successful migration

1. Stop API, reporting worker, scheduled jobs, and administrative writes.
2. Preserve the failed migrated branch for investigation.
3. Restore staging from the verified pre-migration branch/restore point, or
   repoint all staging services to that branch.
4. Deploy the last verified application artifact compatible with migrations
   001–004. In this repository that baseline is commit `2e07d70`; verify the
   deployment record before rollback. Do not deploy checkpoint `45a380f`
   against a restored pre-005 database because its runtime expects the new
   schema.
5. Restore the matching pre-migration environment-variable configuration.
6. Restart one service instance and perform the consistency verification below.
7. Reopen writes only after sign-off.

Transaction rollback protects failures only before migration 005 commits. Once
the migration is committed, a full rollback requires restoring the database
branch/restore point.

## Post-restore consistency verification

Confirm:

- migration 005 is absent from `schema_migrations`;
- legacy status constraints match the restored application version;
- order/order-item/payment/voucher row counts match the restore-point record;
- order totals equal their preserved historical item snapshots;
- payment totals and references match the restore point;
- no status-history, price-history, loyalty-ledger, or voucher-redemption rows
  from the failed attempt remain;
- API health/readiness succeeds with the pre-migration application;
- one historical receipt renders without modifying data.

## Preferred rollback summary

The approved method is a Neon branch or restore point created immediately
before migration. SQL-only reversal is not approved for a full rollback.

This is the only rollback that preserves the exact distinction between:

- legacy `accepted` and `preparing`;
- legacy `closed` and pre-existing `picked_up`;
- pre-migration `updated_at` values;
- data subsequently written to the new history and ledger tables.

## Why a generic down migration is unsafe

- `accepted` and `preparing` both become `in_preparation`; their origin cannot
  be reconstructed.
- `closed` becomes `picked_up`, which is indistinguishable from orders that
  were already `picked_up`.
- New image, place-detail, fee, status-history, loyalty, price-history, and
  voucher-redemption data may be used immediately after deployment.
- The old payment constraint does not accept `voided`.
- Dropping the new tables or columns would permanently delete post-migration
  data.

## Emergency schema-only reversal

Use this only when no post-migration writes occurred, a snapshot is
unavailable, and the lossy status mapping has been explicitly accepted.
Execute it manually inside a transaction on a disposable branch first.

```sql
begin;

drop index if exists orders_active_created_idx;
drop index if exists payments_order_reference_unique;
drop index if exists order_status_history_order_idx;

drop table if exists voucher_redemptions;
drop table if exists loyalty_ledger;
drop table if exists menu_price_history;
drop table if exists order_status_history;

alter table order_items
  drop column if exists image_url_snapshot;

alter table menu_items
  drop constraint if exists menu_items_image_provider_check,
  drop constraint if exists menu_items_availability_status_check,
  drop column if exists image_public_id,
  drop column if exists image_provider,
  drop column if exists image_url,
  drop column if exists availability_status;

alter table orders
  drop constraint if exists orders_delivery_fee_nonnegative,
  drop constraint if exists orders_service_fee_nonnegative,
  drop constraint if exists orders_order_place_check,
  drop column if exists delivery_fee,
  drop column if exists service_fee,
  drop column if exists place_details,
  drop column if exists order_place;

-- Stop here unless a reviewed, business-approved lossy status mapping has
-- been supplied. Do not delete the schema_migrations row yet.

rollback;
```

The example deliberately ends with `rollback`. Replace it with `commit` only
after reviewing the resulting schema and separately resolving status/payment
compatibility.

Remove the `005_operational_integrity.sql` entry from `schema_migrations` only
after every schema and data change has been reversed successfully. Otherwise,
the migration ledger would no longer describe the database.
