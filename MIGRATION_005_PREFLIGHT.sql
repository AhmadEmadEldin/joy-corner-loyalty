\set ON_ERROR_STOP on

-- Enforced read-only preflight for 005_operational_integrity.sql.
-- PostgreSQL permits temporary-table work in a read-only transaction; all
-- temporary data is also discarded by the final rollback.
begin read only;

create temporary table migration_005_findings (
  check_name text not null,
  current_value text not null,
  row_count bigint not null,
  blocking boolean not null,
  remediation text not null
) on commit drop;

create temporary table migration_005_inventory (
  table_name text primary key,
  table_exists boolean not null,
  row_count bigint
) on commit drop;

create temporary table migration_005_versions (
  filename text not null,
  checksum text,
  applied_at timestamptz
) on commit drop;

create temporary table migration_005_menu_preview (
  target_availability_status text not null,
  row_count bigint not null
) on commit drop;

insert into migration_005_findings
  (check_name, current_value, row_count, blocking, remediation)
select
  'invalid_order_status',
  coalesce(status, '<NULL>'),
  count(*),
  true,
  'Map or correct this value before applying migration 005.'
from orders
where status is null
   or status not in (
     'pending_confirmation','accepted','preparing','closed',
     'draft','submitted','awaiting_confirmation','confirmed',
     'in_preparation','ready','picked_up','cancelled','rejected'
   )
group by status;

insert into migration_005_findings
  (check_name, current_value, row_count, blocking, remediation)
select
  'invalid_payment_status',
  coalesce(payment_status, '<NULL>'),
  count(*),
  true,
  'Map or correct this value before applying migration 005.'
from orders
where payment_status is null
   or payment_status not in (
     'unpaid','partially_paid','paid','refunded','voided'
   )
group by payment_status;

insert into migration_005_findings
  (check_name, current_value, row_count, blocking, remediation)
select
  'whitespace_only_payment_reference',
  '<whitespace-only>',
  count(*),
  false,
  'Migration 005 will normalize these unusable references to null.'
from payments
where reference is not null and btrim(reference) = ''
having count(*) > 0;

insert into migration_005_findings
  (check_name, current_value, row_count, blocking, remediation)
select
  'duplicate_payment_reference',
  order_id::text || ' / ' || btrim(reference),
  count(*),
  true,
  'Do not merge payments. Assign distinct references or resolve the duplicate records.'
from payments
where reference is not null and btrim(reference) <> ''
group by order_id, btrim(reference)
having count(*) > 1;

do $preflight$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = current_schema()
      and table_name = 'orders'
      and column_name = 'order_place'
  ) then
    execute $report$
      insert into migration_005_findings
        (check_name, current_value, row_count, blocking, remediation)
      select
        'invalid_order_place',
        coalesce(order_place, '<NULL>'),
        count(*),
        true,
        'Use dine_in, takeaway, car, outside, or delivery.'
      from orders
      where order_place is null
         or order_place not in (
           'dine_in','takeaway','car','outside','delivery'
         )
      group by order_place
    $report$;
  else
    insert into migration_005_findings
      (check_name, current_value, row_count, blocking, remediation)
    values (
      'order_place_column',
      '<not present>',
      0,
      false,
      'Migration 005 will add order_place with takeaway as its default.'
    );
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = current_schema()
      and table_name = 'orders'
      and column_name = 'service_fee'
  ) then
    execute $report$
      insert into migration_005_findings
        (check_name, current_value, row_count, blocking, remediation)
      select
        'invalid_service_fee',
        '<null-or-negative>',
        count(*),
        true,
        'Resolve null or negative service fees before migration.'
      from orders
      where service_fee is null or service_fee < 0
      having count(*) > 0
    $report$;
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = current_schema()
      and table_name = 'orders'
      and column_name = 'delivery_fee'
  ) then
    execute $report$
      insert into migration_005_findings
        (check_name, current_value, row_count, blocking, remediation)
      select
        'invalid_delivery_fee',
        '<null-or-negative>',
        count(*),
        true,
        'Resolve null or negative delivery fees before migration.'
      from orders
      where delivery_fee is null or delivery_fee < 0
      having count(*) > 0
    $report$;
  end if;
end
$preflight$;

do $preflight$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = current_schema()
      and table_name = 'menu_items'
      and column_name = 'availability_status'
  ) then
    execute $report$
      insert into migration_005_findings
        (check_name, current_value, row_count, blocking, remediation)
      select
        'null_menu_availability',
        '<NULL>',
        count(*),
        false,
        'Migration 005 will derive availability from active and available.'
      from menu_items
      where availability_status is null
      having count(*) > 0
    $report$;
    execute $report$
      insert into migration_005_findings
        (check_name, current_value, row_count, blocking, remediation)
      select
        'invalid_menu_availability',
        availability_status,
        count(*),
        true,
        'Use available, temporarily_unavailable, sold_out, or archived.'
      from menu_items
      where availability_status is not null
        and availability_status not in (
          'available','temporarily_unavailable','sold_out','archived'
        )
      group by availability_status
    $report$;
    execute $preview$
      insert into migration_005_menu_preview
        (target_availability_status, row_count)
      select
        case
          when not active then 'archived'
          when available then 'available'
          else 'temporarily_unavailable'
        end,
        count(*)
      from menu_items
      where availability_status is null
      group by 1
    $preview$;
  else
    insert into migration_005_findings
      (check_name, current_value, row_count, blocking, remediation)
    values (
      'menu_availability_column',
      '<not present>',
      0,
      false,
      'Migration 005 will add and backfill availability_status.'
    );
    insert into migration_005_menu_preview
      (target_availability_status, row_count)
    select
      case
        when not active then 'archived'
        when available then 'available'
        else 'temporarily_unavailable'
      end,
      count(*)
    from menu_items
    group by 1;
  end if;
end
$preflight$;

do $preflight$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = current_schema()
      and table_name = 'menu_items'
      and column_name = 'image_provider'
  ) then
    execute $report$
      insert into migration_005_findings
        (check_name, current_value, row_count, blocking, remediation)
      select
        'unsupported_image_provider',
        image_provider,
        count(*),
        true,
        'Only cloudinary or null is supported.'
      from menu_items
      where image_provider is not null and image_provider <> 'cloudinary'
      group by image_provider
    $report$;
  end if;
end
$preflight$;

insert into migration_005_findings
  (check_name, current_value, row_count, blocking, remediation)
select
  'orphaned_order_item_order',
  '<missing-order>',
  count(*),
  true,
  'Restore or remove orphaned order items before migration.'
from order_items oi
left join orders o on o.id = oi.order_id
where o.id is null
having count(*) > 0;

insert into migration_005_findings
  (check_name, current_value, row_count, blocking, remediation)
select
  'orphaned_order_item_menu_item',
  '<missing-menu-item>',
  count(*),
  true,
  'Restore the referenced menu item before migration.'
from order_items oi
left join menu_items mi on mi.id = oi.menu_item_id
where mi.id is null
having count(*) > 0;

insert into migration_005_findings
  (check_name, current_value, row_count, blocking, remediation)
select
  'orphaned_payment_order',
  '<missing-order>',
  count(*),
  true,
  'Restore the referenced order before migration.'
from payments p
left join orders o on o.id = p.order_id
where o.id is null
having count(*) > 0;

insert into migration_005_findings
  (check_name, current_value, row_count, blocking, remediation)
select
  'orphaned_payment_receiver',
  '<missing-account>',
  count(*),
  true,
  'Restore the referenced receiving account before migration.'
from payments p
left join accounts a on a.id = p.received_by
where a.id is null
having count(*) > 0;

insert into migration_005_findings
  (check_name, current_value, row_count, blocking, remediation)
select
  'orphaned_voucher_customer',
  '<missing-customer>',
  count(*),
  true,
  'Restore the referenced customer before migration.'
from vouchers v
left join accounts a on a.id = v.customer_id
where a.id is null
having count(*) > 0;

insert into migration_005_findings
  (check_name, current_value, row_count, blocking, remediation)
select
  'orphaned_voucher_free_item',
  '<missing-menu-item>',
  count(*),
  true,
  'Restore the referenced free menu item before migration.'
from vouchers v
left join menu_items mi on mi.id = v.free_item_id
where v.free_item_id is not null and mi.id is null
having count(*) > 0;

do $preflight$
begin
  if to_regclass('voucher_redemptions') is not null then
    execute $report$
      insert into migration_005_findings
        (check_name, current_value, row_count, blocking, remediation)
      select
        'duplicate_voucher_redemption_candidate',
        voucher_id::text,
        count(*),
        true,
        'Investigate the repeated voucher redemption records; do not merge them.'
      from voucher_redemptions
      group by voucher_id
      having count(*) > 1
    $report$;
  else
    insert into migration_005_findings
      (check_name, current_value, row_count, blocking, remediation)
    values (
      'voucher_redemptions_table',
      '<not present>',
      0,
      false,
      'Migration 005 will create the table without synthetic redemptions.'
    );
  end if;
end
$preflight$;

do $preflight$
declare
  candidate text;
  candidates constant text[] := array[
    'accounts','orders','order_items','payments','vouchers','menu_items',
    'menu_item_sizes','order_status_history','menu_price_history',
    'loyalty_ledger','voucher_redemptions'
  ];
begin
  foreach candidate in array candidates loop
    if to_regclass(candidate) is null then
      insert into migration_005_inventory(table_name, table_exists, row_count)
      values(candidate, false, null);
    else
      execute format(
        'insert into migration_005_inventory(table_name,table_exists,row_count)
         select %L,true,count(*) from %I',
        candidate,
        candidate
      );
    end if;
  end loop;

  if to_regclass('schema_migrations') is null then
    insert into migration_005_versions(filename, checksum, applied_at)
    values('<schema_migrations not present>', null, null);
  else
    execute $versions$
      insert into migration_005_versions(filename, checksum, applied_at)
      select filename, checksum, applied_at
      from schema_migrations
      order by applied_at, filename
    $versions$;
  end if;
end
$preflight$;

\echo 'Migration 005 findings'
select check_name, current_value, row_count, blocking, remediation
from migration_005_findings
order by blocking desc, check_name, current_value;

\echo 'Migration 005 readiness'
select
  case
    when count(*) filter (where blocking and row_count > 0) = 0 then 'READY'
    else 'BLOCKED'
  end as migration_005_readiness,
  count(*) filter (where blocking and row_count > 0) as blocking_findings,
  coalesce(sum(row_count) filter (where blocking), 0) as blocking_rows
from migration_005_findings;

\echo 'Legacy order-status conversion counts'
select
  status as current_status,
  case status
    when 'pending_confirmation' then 'awaiting_confirmation'
    when 'accepted' then 'in_preparation'
    when 'preparing' then 'in_preparation'
    when 'closed' then 'picked_up'
  end as target_status,
  count(*) as row_count
from orders
where status in ('pending_confirmation','accepted','preparing','closed')
group by status
order by status;

\echo 'Duplicate payment-reference details (only duplicate groups)'
select
  order_id,
  btrim(reference) as duplicate_reference,
  count(*) as duplicate_count,
  jsonb_agg(
    jsonb_build_object(
      'payment_id', id,
      'amount', amount,
      'created_at', created_at
    )
    order by created_at, id
  ) as payment_records
from payments
where reference is not null and btrim(reference) <> ''
group by order_id, btrim(reference)
having count(*) > 1
order by order_id, duplicate_reference;

\echo 'Whitespace-only payment references scheduled for null normalization'
select count(*) as row_count, array_agg(id order by id) as payment_ids
from payments
where reference is not null and btrim(reference) = '';

\echo 'Menu availability backfill preview'
select target_availability_status, row_count
from migration_005_menu_preview
order by target_availability_status;

\echo 'Existing schema migration versions'
select filename, checksum, applied_at
from migration_005_versions
order by applied_at nulls first, filename;

\echo 'Affected-table row counts'
select table_name, table_exists, row_count
from migration_005_inventory
order by table_name;

rollback;
