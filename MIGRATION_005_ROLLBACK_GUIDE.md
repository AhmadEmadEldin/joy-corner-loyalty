# Migration 005 Rollback Guide

Migration 005 is transactional while it is being applied. If any statement
fails, the project migration runner rolls the entire file back automatically.

After a successful commit, rollback is not lossless. Create a Neon branch or
snapshot immediately before applying the migration.

## Preferred rollback

1. Stop API, worker, and administrative writes.
2. Restore or promote the pre-migration Neon branch/snapshot.
3. Deploy the previous API, reporting worker, and frontend together.
4. Restore the previous environment-variable set.
5. Run read-only health and receipt checks before reopening writes.

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
