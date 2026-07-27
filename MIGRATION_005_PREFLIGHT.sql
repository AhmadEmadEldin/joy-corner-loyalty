\set ON_ERROR_STOP on

-- Read-only-in-effect preflight for 005_operational_integrity.sql.
-- The temporary report table and all statements are rolled back at the end.
begin;

create temporary table migration_005_findings (
  check_name text not null,
  current_value text not null,
  row_count bigint not null,
  remediation text not null
) on commit drop;

create temporary table migration_005_menu_preview (
  target_availability_status text not null,
  row_count bigint not null
) on commit drop;

insert into migration_005_findings
  (check_name, current_value, row_count, remediation)
select
  'invalid_order_status',
  status,
  count(*),
  'Map or correct this value before applying migration 005.'
from orders
where status not in (
  'pending_confirmation','accepted','preparing','closed',
  'draft','submitted','awaiting_confirmation','confirmed',
  'in_preparation','ready','picked_up','cancelled','rejected'
)
group by status;

insert into migration_005_findings
  (check_name, current_value, row_count, remediation)
select
  'invalid_payment_status',
  payment_status,
  count(*),
  'Map or correct this value before applying migration 005.'
from orders
where payment_status not in (
  'unpaid','partially_paid','paid','refunded','voided'
)
group by payment_status;

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
        (check_name, current_value, row_count, remediation)
      select
        'invalid_order_place',
        coalesce(order_place, '<NULL>'),
        count(*),
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
      (check_name, current_value, row_count, remediation)
    values (
      'order_place_column',
      '<not present>',
      0,
      'Migration 005 will add order_place with takeaway as its default.'
    );
  end if;
end
$preflight$;

insert into migration_005_findings
  (check_name, current_value, row_count, remediation)
select
  'duplicate_payment_reference',
  order_id::text || ' / ' || reference,
  count(*),
  'Keep one payment or assign distinct idempotency references before migration.'
from payments
where reference is not null and reference <> ''
group by order_id, reference
having count(*) > 1;

\echo 'Migration 005 findings'
select check_name, current_value, row_count, remediation
from migration_005_findings
order by check_name, current_value;

\echo 'Migration 005 readiness'
select
  case
    when coalesce(sum(row_count), 0) = 0 then 'READY'
    else 'BLOCKED'
  end as migration_005_readiness,
  coalesce(sum(row_count), 0) as rows_requiring_remediation
from migration_005_findings;

\echo 'Order status conversion preview'
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

\echo 'Menu availability backfill preview'
do $preflight$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = current_schema()
      and table_name = 'menu_items'
      and column_name = 'availability_status'
  ) then
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

select target_availability_status, row_count
from migration_005_menu_preview
order by target_availability_status;

rollback;
