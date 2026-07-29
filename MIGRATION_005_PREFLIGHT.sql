-- Read-only preflight for 005_operational_integrity.sql.
-- This file is deliberately one SELECT statement: it creates no temporary
-- objects and performs no persistent or transactional writes.
with schema_flags as (
  select
    exists (
      select 1 from information_schema.columns
      where table_schema=current_schema() and table_name='orders'
        and column_name='order_place'
    ) as has_order_place,
    exists (
      select 1 from information_schema.columns
      where table_schema=current_schema() and table_name='orders'
        and column_name='service_fee'
    ) as has_service_fee,
    exists (
      select 1 from information_schema.columns
      where table_schema=current_schema() and table_name='orders'
        and column_name='delivery_fee'
    ) as has_delivery_fee,
    exists (
      select 1 from information_schema.columns
      where table_schema=current_schema() and table_name='menu_items'
        and column_name='availability_status'
    ) as has_menu_availability,
    exists (
      select 1 from information_schema.columns
      where table_schema=current_schema() and table_name='menu_items'
        and column_name='image_provider'
    ) as has_image_provider
),
findings(check_name,current_value,row_count,blocking,remediation) as (
  select 'invalid_order_status',coalesce(status,'<NULL>'),count(*),true,
    'Map or correct this value before applying migration 005.'
  from orders
  where status is null or status not in (
    'pending_confirmation','accepted','preparing','closed',
    'draft','submitted','awaiting_confirmation','confirmed',
    'in_preparation','ready','picked_up','cancelled','rejected'
  )
  group by status

  union all
  select 'invalid_payment_status',coalesce(payment_status,'<NULL>'),count(*),true,
    'Map or correct this value before applying migration 005.'
  from orders
  where payment_status is null or payment_status not in (
    'unpaid','partially_paid','paid','refunded','voided'
  )
  group by payment_status

  union all
  select 'whitespace_only_payment_reference','<whitespace-only>',count(*),false,
    'Migration 005 will normalize these unusable references to null.'
  from payments
  where reference is not null and btrim(reference)=''
  having count(*) > 0

  union all
  select 'duplicate_payment_reference',order_id::text||' / '||btrim(reference),
    count(*),true,
    'Assign distinct references or resolve duplicate records without merging payments.'
  from payments
  where reference is not null and btrim(reference)<>''
  group by order_id,btrim(reference)
  having count(*) > 1

  union all
  select 'order_place_column','<not present>',0,false,
    'Migration 005 will add order_place with takeaway as its default.'
  from schema_flags where not has_order_place

  union all
  select 'invalid_order_place',
    coalesce(to_jsonb(o)->>'order_place','<NULL>'),count(*),true,
    'Use dine_in, takeaway, car, outside, or delivery.'
  from orders o cross join schema_flags
  where has_order_place and (
    to_jsonb(o)->>'order_place' is null or
    to_jsonb(o)->>'order_place' not in (
      'dine_in','takeaway','car','outside','delivery'
    )
  )
  group by to_jsonb(o)->>'order_place'

  union all
  select 'invalid_service_fee','<null-or-negative>',count(*),true,
    'Resolve null or negative service fees before migration.'
  from orders o cross join schema_flags
  where has_service_fee and (
    to_jsonb(o)->>'service_fee' is null or
    (to_jsonb(o)->>'service_fee')::numeric < 0
  )
  having count(*) > 0

  union all
  select 'invalid_delivery_fee','<null-or-negative>',count(*),true,
    'Resolve null or negative delivery fees before migration.'
  from orders o cross join schema_flags
  where has_delivery_fee and (
    to_jsonb(o)->>'delivery_fee' is null or
    (to_jsonb(o)->>'delivery_fee')::numeric < 0
  )
  having count(*) > 0

  union all
  select 'menu_availability_column','<not present>',0,false,
    'Migration 005 will add and backfill availability_status.'
  from schema_flags where not has_menu_availability

  union all
  select 'null_menu_availability','<NULL>',count(*),false,
    'Migration 005 will derive availability from active and available.'
  from menu_items m cross join schema_flags
  where has_menu_availability and to_jsonb(m)->>'availability_status' is null
  having count(*) > 0

  union all
  select 'invalid_menu_availability',
    to_jsonb(m)->>'availability_status',count(*),true,
    'Use available, temporarily_unavailable, sold_out, or archived.'
  from menu_items m cross join schema_flags
  where has_menu_availability
    and to_jsonb(m)->>'availability_status' is not null
    and to_jsonb(m)->>'availability_status' not in (
      'available','temporarily_unavailable','sold_out','archived'
    )
  group by to_jsonb(m)->>'availability_status'

  union all
  select 'unsupported_image_provider',
    to_jsonb(m)->>'image_provider',count(*),true,
    'Only cloudinary or null is supported.'
  from menu_items m cross join schema_flags
  where has_image_provider
    and to_jsonb(m)->>'image_provider' is not null
    and to_jsonb(m)->>'image_provider'<>'cloudinary'
  group by to_jsonb(m)->>'image_provider'

  union all
  select 'orphaned_order_item_order','<missing-order>',count(*),true,
    'Restore or remove orphaned order items before migration.'
  from order_items oi left join orders o on o.id=oi.order_id
  where o.id is null having count(*) > 0

  union all
  select 'orphaned_order_item_menu_item','<missing-menu-item>',count(*),true,
    'Restore the referenced menu item before migration.'
  from order_items oi left join menu_items mi on mi.id=oi.menu_item_id
  where mi.id is null having count(*) > 0

  union all
  select 'orphaned_payment_order','<missing-order>',count(*),true,
    'Restore the referenced order before migration.'
  from payments p left join orders o on o.id=p.order_id
  where o.id is null having count(*) > 0

  union all
  select 'orphaned_payment_receiver','<missing-account>',count(*),true,
    'Restore the referenced receiving account before migration.'
  from payments p left join accounts a on a.id=p.received_by
  where a.id is null having count(*) > 0

  union all
  select 'orphaned_voucher_customer','<missing-customer>',count(*),true,
    'Restore the referenced customer before migration.'
  from vouchers v left join accounts a on a.id=v.customer_id
  where a.id is null having count(*) > 0

  union all
  select 'orphaned_voucher_free_item','<missing-menu-item>',count(*),true,
    'Restore the referenced free menu item before migration.'
  from vouchers v left join menu_items mi on mi.id=v.free_item_id
  where v.free_item_id is not null and mi.id is null
  having count(*) > 0

  union all
  select 'voucher_redemptions_table','<not present>',0,false,
    'Migration 005 will create the table without synthetic redemptions.'
  where to_regclass('voucher_redemptions') is null

  union all
  select 'duplicate_voucher_redemption_candidate','<duplicate-voucher>',
    case
      when to_regclass('voucher_redemptions') is null then 0
      else coalesce(
        nullif(
          (xpath(
            '/row/count/text()',
            query_to_xml(
              'select count(*) from (select voucher_id from voucher_redemptions group by voucher_id having count(*) > 1) d',
              false,true,''
            )
          ))[1]::text,
          ''
        )::bigint,
        0
      )
    end,
    true,
    'Investigate repeated voucher redemption records; do not merge them.'
  where to_regclass('voucher_redemptions') is not null
),
legacy_status_counts as (
  select status as current_status,
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
),
menu_preview as (
  select
    case
      when not active then 'archived'
      when available then 'available'
      else 'temporarily_unavailable'
    end as target_availability_status,
    count(*) as row_count
  from menu_items
  group by 1
),
inventory as (
  select 'accounts' as table_name,true as table_exists,count(*) as row_count from accounts
  union all select 'orders',true,count(*) from orders
  union all select 'order_items',true,count(*) from order_items
  union all select 'payments',true,count(*) from payments
  union all select 'vouchers',true,count(*) from vouchers
  union all select 'menu_items',true,count(*) from menu_items
  union all select 'menu_item_sizes',true,count(*) from menu_item_sizes
  union all select 'order_status_history',
    to_regclass('order_status_history') is not null,null::bigint
  union all select 'menu_price_history',
    to_regclass('menu_price_history') is not null,null::bigint
  union all select 'loyalty_ledger',
    to_regclass('loyalty_ledger') is not null,null::bigint
  union all select 'voucher_redemptions',
    to_regclass('voucher_redemptions') is not null,null::bigint
)
select jsonb_build_object(
  'readiness',case
    when count(*) filter(where blocking and row_count>0)=0 then 'READY'
    else 'BLOCKED'
  end,
  'blockingFindings',count(*) filter(where blocking and row_count>0),
  'blockingRows',coalesce(sum(row_count) filter(where blocking),0),
  'findings',coalesce(
    jsonb_agg(
      jsonb_build_object(
        'check',check_name,
        'value',current_value,
        'rows',row_count,
        'blocking',blocking,
        'remediation',remediation
      )
      order by blocking desc,check_name,current_value
    ),
    '[]'::jsonb
  ),
  'legacyStatusConversions',(
    select coalesce(jsonb_agg(to_jsonb(l) order by current_status),'[]'::jsonb)
    from legacy_status_counts l
  ),
  'duplicatePaymentReferences',(
    select coalesce(jsonb_agg(to_jsonb(d) order by order_id,reference),'[]'::jsonb)
    from (
      select order_id,btrim(reference) as reference,count(*) as row_count
      from payments
      where reference is not null and btrim(reference)<>''
      group by order_id,btrim(reference)
      having count(*)>1
    ) d
  ),
  'whitespacePaymentReferences',(
    select count(*) from payments
    where reference is not null and btrim(reference)=''
  ),
  'menuAvailabilityPreview',(
    select coalesce(
      jsonb_agg(to_jsonb(m) order by target_availability_status),
      '[]'::jsonb
    ) from menu_preview m
  ),
  'schemaMigrations',(
    select coalesce(
      jsonb_agg(to_jsonb(s) order by applied_at,filename),
      '[]'::jsonb
    ) from schema_migrations s
  ),
  'inventory',(
    select jsonb_agg(to_jsonb(i) order by table_name) from inventory i
  )
) as migration_005_preflight
from findings;
