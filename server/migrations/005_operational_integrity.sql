-- Canonical order workflow, auditable catalog changes, and immutable rewards.
do $$
declare
  invalid_statuses text;
begin
  select string_agg(format('%s (%s row(s))', status, row_count), ', ')
  into invalid_statuses
  from (
    select status, count(*) as row_count
    from orders
    where status not in (
      'pending_confirmation','accepted','preparing','closed',
      'draft','submitted','awaiting_confirmation','confirmed',
      'in_preparation','ready','picked_up','cancelled','rejected'
    )
    group by status
    order by status
  ) invalid;

  if invalid_statuses is not null then
    raise exception
      'Migration 005 preflight failed: invalid order status values: %',
      invalid_statuses;
  end if;
end
$$;

alter table orders drop constraint if exists orders_status_check;

update orders set status = case status
  when 'pending_confirmation' then 'awaiting_confirmation'
  when 'accepted' then 'in_preparation'
  when 'preparing' then 'in_preparation'
  when 'closed' then 'picked_up'
  else status
end
where status in ('pending_confirmation','accepted','preparing','closed');

alter table orders alter column status set default 'awaiting_confirmation';
alter table orders add constraint orders_status_check check (
  status in (
    'draft','submitted','awaiting_confirmation','confirmed',
    'in_preparation','ready','picked_up','cancelled','rejected'
  )
);

do $$
declare
  invalid_statuses text;
begin
  select string_agg(format('%s (%s row(s))', payment_status, row_count), ', ')
  into invalid_statuses
  from (
    select payment_status, count(*) as row_count
    from orders
    where payment_status not in (
      'unpaid','partially_paid','paid','refunded','voided'
    )
    group by payment_status
    order by payment_status
  ) invalid;

  if invalid_statuses is not null then
    raise exception
      'Migration 005 preflight failed: invalid payment status values: %',
      invalid_statuses;
  end if;
end
$$;

alter table orders drop constraint if exists orders_payment_status_check;
alter table orders add constraint orders_payment_status_check check (
  payment_status in ('unpaid','partially_paid','paid','refunded','voided')
);

alter table orders add column if not exists order_place text not null default 'takeaway';
alter table orders add column if not exists place_details jsonb not null default '{}'::jsonb;
alter table orders add column if not exists service_fee numeric(12,2) not null default 0;
alter table orders add column if not exists delivery_fee numeric(12,2) not null default 0;

do $$
declare
  invalid_delivery_fees bigint;
  invalid_places text;
  invalid_place_details bigint;
  invalid_service_fees bigint;
begin
  select string_agg(format('%s (%s row(s))', value, row_count), ', ')
  into invalid_places
  from (
    select coalesce(order_place, '<NULL>') as value, count(*) as row_count
    from orders
    where order_place is null
       or order_place not in ('dine_in','takeaway','car','outside','delivery')
    group by order_place
    order by order_place
  ) invalid;

  select count(*) into invalid_place_details
  from orders where place_details is null;

  select count(*) into invalid_service_fees
  from orders where service_fee is null or service_fee < 0;

  select count(*) into invalid_delivery_fees
  from orders where delivery_fee is null or delivery_fee < 0;

  if invalid_places is not null then
    raise exception
      'Migration 005 preflight failed: invalid order_place values: %',
      invalid_places;
  end if;
  if invalid_place_details > 0 then
    raise exception
      'Migration 005 preflight failed: % order(s) have null place_details',
      invalid_place_details;
  end if;
  if invalid_service_fees > 0 then
    raise exception
      'Migration 005 preflight failed: % order(s) have a null or negative service_fee',
      invalid_service_fees;
  end if;
  if invalid_delivery_fees > 0 then
    raise exception
      'Migration 005 preflight failed: % order(s) have a null or negative delivery_fee',
      invalid_delivery_fees;
  end if;
end
$$;

alter table orders alter column order_place set default 'takeaway';
alter table orders alter column order_place set not null;
alter table orders alter column place_details set default '{}'::jsonb;
alter table orders alter column place_details set not null;
alter table orders alter column service_fee set default 0;
alter table orders alter column service_fee set not null;
alter table orders alter column delivery_fee set default 0;
alter table orders alter column delivery_fee set not null;

alter table orders drop constraint if exists orders_order_place_check;
alter table orders add constraint orders_order_place_check check (
  order_place in ('dine_in','takeaway','car','outside','delivery')
);
alter table orders drop constraint if exists orders_service_fee_nonnegative;
alter table orders add constraint orders_service_fee_nonnegative check (
  service_fee >= 0
);
alter table orders drop constraint if exists orders_delivery_fee_nonnegative;
alter table orders add constraint orders_delivery_fee_nonnegative check (
  delivery_fee >= 0
);

create table if not exists order_status_history (
  id bigserial primary key,
  order_id uuid not null references orders(id) on delete cascade,
  previous_status text,
  new_status text not null,
  changed_by uuid references accounts(id),
  changed_by_role text not null,
  note text,
  changed_at timestamptz not null default now()
);

create index if not exists order_status_history_order_idx
  on order_status_history(order_id, changed_at);

alter table menu_items add column if not exists availability_status text;
update menu_items
set availability_status = case
  when not active then 'archived'
  when available then 'available'
  else 'temporarily_unavailable'
end
where availability_status is null;

do $$
declare
  invalid_availability text;
begin
  select string_agg(
    format('%s (%s row(s))', coalesce(availability_status, '<NULL>'), row_count),
    ', '
  )
  into invalid_availability
  from (
    select availability_status, count(*) as row_count
    from menu_items
    where availability_status is null
       or availability_status not in (
         'available','temporarily_unavailable','sold_out','archived'
       )
    group by availability_status
    order by availability_status
  ) invalid;

  if invalid_availability is not null then
    raise exception
      'Migration 005 preflight failed: invalid menu availability values: %',
      invalid_availability;
  end if;
end
$$;

alter table menu_items alter column availability_status set not null;
alter table menu_items alter column availability_status set default 'available';
alter table menu_items
  drop constraint if exists menu_items_availability_status_check;
alter table menu_items add constraint menu_items_availability_status_check check (
  availability_status in (
    'available','temporarily_unavailable','sold_out','archived'
  )
);
alter table menu_items add column if not exists image_url text;
alter table menu_items add column if not exists image_provider text;
alter table menu_items add column if not exists image_public_id text;

do $$
declare
  invalid_providers text;
begin
  select string_agg(
    format('%s (%s row(s))', image_provider, row_count),
    ', '
  )
  into invalid_providers
  from (
    select image_provider, count(*) as row_count
    from menu_items
    where image_provider is not null
      and image_provider <> 'cloudinary'
    group by image_provider
    order by image_provider
  ) invalid;

  if invalid_providers is not null then
    raise exception
      'Migration 005 preflight failed: unsupported image_provider values: %',
      invalid_providers;
  end if;
end
$$;

alter table menu_items
  drop constraint if exists menu_items_image_provider_check;
alter table menu_items
  add constraint menu_items_image_provider_check check (
    image_provider is null or image_provider = 'cloudinary'
  );

create table if not exists menu_price_history (
  id bigserial primary key,
  menu_item_id uuid not null references menu_items(id),
  size_id uuid not null references menu_item_sizes(id),
  previous_price_minor integer not null check (previous_price_minor >= 0),
  new_price_minor integer not null check (new_price_minor > 0),
  changed_by uuid not null references accounts(id),
  changed_at timestamptz not null default now()
);

alter table order_items add column if not exists image_url_snapshot text;

create table if not exists loyalty_ledger (
  id bigserial primary key,
  customer_id uuid not null references accounts(id),
  order_id uuid references orders(id),
  points_delta integer not null,
  balance_after integer not null,
  reason text not null,
  changed_by uuid references accounts(id),
  created_at timestamptz not null default now(),
  unique(order_id, reason)
);

do $$
declare
  negative_balances bigint;
begin
  select count(*) into negative_balances
  from loyalty_ledger where balance_after < 0;

  if negative_balances > 0 then
    raise exception
      'Migration 005 preflight failed: % loyalty ledger row(s) have a negative balance_after',
      negative_balances;
  end if;
end
$$;

alter table loyalty_ledger
  drop constraint if exists loyalty_ledger_balance_after_nonnegative;
alter table loyalty_ledger
  add constraint loyalty_ledger_balance_after_nonnegative check (
    balance_after >= 0
  );

create table if not exists voucher_redemptions (
  id bigserial primary key,
  voucher_id uuid not null unique references vouchers(id),
  order_id uuid not null references orders(id),
  customer_id uuid not null references accounts(id),
  discount_amount numeric(12,2) not null,
  redeemed_at timestamptz not null default now()
);

do $$
declare
  negative_discounts bigint;
begin
  select count(*) into negative_discounts
  from voucher_redemptions where discount_amount < 0;

  if negative_discounts > 0 then
    raise exception
      'Migration 005 preflight failed: % voucher redemption row(s) have a negative discount_amount',
      negative_discounts;
  end if;
end
$$;

alter table voucher_redemptions
  drop constraint if exists voucher_redemptions_discount_amount_nonnegative;
alter table voucher_redemptions
  add constraint voucher_redemptions_discount_amount_nonnegative check (
    discount_amount >= 0
  );

-- Whitespace-only references contain no usable idempotency value. Normalizing
-- them to null is safe and keeps them outside the partial uniqueness index.
update payments
set reference = null
where reference is not null and btrim(reference) = '';

do $$
declare
  duplicate_groups bigint;
begin
  select count(*) into duplicate_groups
  from (
    select order_id, btrim(reference) as normalized_reference
    from payments
    where reference is not null and btrim(reference) <> ''
    group by order_id, btrim(reference)
    having count(*) > 1
  ) duplicates;

  if duplicate_groups > 0 then
    raise exception
      'Migration 005 preflight failed: % duplicate non-empty payment reference group(s) exist; resolve duplicate (order_id, reference) values before retrying',
      duplicate_groups;
  end if;
end
$$;

create unique index if not exists payments_order_reference_unique
  on payments(order_id, reference)
  where reference is not null and btrim(reference) <> '';

create index if not exists orders_active_created_idx
  on orders(created_at desc)
  where status in (
    'submitted','awaiting_confirmation','confirmed','in_preparation','ready'
  );
