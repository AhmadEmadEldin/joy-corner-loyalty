create table if not exists business_days (
  id uuid primary key default gen_random_uuid(),
  business_date text not null unique,
  opened_at timestamptz not null default now(),
  opened_by_user_id uuid not null references accounts(id),
  closed_at timestamptz,
  closed_by_user_id uuid references accounts(id),
  status text not null default 'OPEN' check (status in ('OPEN','CLOSED')),
  gross_sales numeric(12,2) not null default 0,
  net_sales numeric(12,2) not null default 0,
  paid_amount numeric(12,2) not null default 0,
  unpaid_amount numeric(12,2) not null default 0,
  partially_paid_amount numeric(12,2) not null default 0,
  refunded_amount numeric(12,2) not null default 0,
  receipt_count integer not null default 0,
  order_count integer not null default 0,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table orders add column if not exists business_day_id uuid references business_days(id);
alter table orders add column if not exists business_date text;
alter table orders add column if not exists archived boolean not null default false;
alter table orders add column if not exists archived_at timestamptz;
alter table orders add column if not exists archived_by_user_id uuid references accounts(id);
alter table orders add column if not exists archive_reason text;

create index if not exists orders_business_day_idx on orders(business_day_id);
create index if not exists orders_business_date_idx on orders(business_date);
create index if not exists orders_archived_idx on orders(archived) where not archived;

alter table order_items add column if not exists original_unit_price numeric(12,2);
alter table order_items add column if not exists override_reason text;
alter table order_items add column if not exists overridden_by_user_id uuid references accounts(id);
alter table order_items add column if not exists overridden_at timestamptz;

alter table payments add column if not exists is_refund boolean not null default false;
alter table payments add column if not exists voided boolean not null default false;
alter table payments add column if not exists voided_at timestamptz;
alter table payments add column if not exists voided_by_user_id uuid references accounts(id);
