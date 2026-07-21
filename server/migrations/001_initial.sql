create extension if not exists pgcrypto;

create sequence if not exists customer_number_seq start 1001;
create sequence if not exists order_number_seq start 1;
create sequence if not exists payment_number_seq start 1;

create table if not exists accounts (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  password_hash text not null,
  full_name text not null,
  phone text,
  role text not null default 'customer' check (role in ('owner','manager','cashier','waiter','barista','customer')),
  customer_number text unique,
  date_of_birth date,
  favorite_drink text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists menu_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  sort_order integer not null default 0,
  active boolean not null default true
);

create table if not exists menu_items (
  id uuid primary key default gen_random_uuid(),
  legacy_id text unique,
  category_id uuid not null references menu_categories(id),
  name text not null,
  description text not null default '',
  image_content_type text,
  image_bytes bytea,
  active boolean not null default true,
  available boolean not null default true,
  loyalty_eligible boolean not null default true,
  preparation_station text not null default 'barista' check (preparation_station in ('barista','kitchen')),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists menu_item_sizes (
  id uuid primary key default gen_random_uuid(),
  menu_item_id uuid not null references menu_items(id) on delete cascade,
  size_name text not null,
  price numeric(12,2) not null check (price > 0),
  sort_order integer not null default 0,
  unique(menu_item_id, size_name)
);

create table if not exists menu_modifiers (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  price numeric(12,2) not null default 0 check (price >= 0),
  active boolean not null default true
);

create table if not exists menu_item_modifiers (
  menu_item_id uuid not null references menu_items(id) on delete cascade,
  modifier_id uuid not null references menu_modifiers(id) on delete cascade,
  primary key(menu_item_id, modifier_id)
);

create table if not exists orders (
  id uuid primary key default gen_random_uuid(),
  legacy_id text unique,
  order_number text not null unique,
  idempotency_key text not null unique,
  customer_id uuid references accounts(id),
  created_by uuid references accounts(id),
  pickup_name text not null,
  customer_notes text not null default '',
  status text not null default 'pending_confirmation' check (status in ('pending_confirmation','confirmed','accepted','preparing','ready','picked_up','closed','rejected','cancelled')),
  confirmation_status text not null default 'pending',
  payment_status text not null default 'unpaid' check (payment_status in ('unpaid','partially_paid','paid','refunded')),
  payment_method text,
  subtotal numeric(12,2) not null,
  discount_total numeric(12,2) not null default 0,
  voucher_discount numeric(12,2) not null default 0,
  tax_total numeric(12,2) not null default 0,
  total numeric(12,2) not null,
  rejection_reason text,
  cancellation_reason text,
  rewards_applied boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  closed_at timestamptz
);

create index if not exists orders_customer_created_idx on orders(customer_id, created_at desc);
create index if not exists orders_status_created_idx on orders(status, created_at);

create table if not exists order_items (
  id uuid primary key default gen_random_uuid(),
  legacy_id text unique,
  order_id uuid not null references orders(id) on delete cascade,
  menu_item_id uuid not null references menu_items(id),
  item_name_snapshot text not null,
  category_name_snapshot text not null,
  size_name text not null,
  quantity integer not null check (quantity > 0),
  unit_price numeric(12,2) not null,
  modifiers_total numeric(12,2) not null default 0,
  total_price numeric(12,2) not null,
  customer_notes text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists order_item_modifiers (
  id uuid primary key default gen_random_uuid(),
  order_item_id uuid not null references order_items(id) on delete cascade,
  modifier_id uuid not null references menu_modifiers(id),
  modifier_name_snapshot text not null,
  unit_price numeric(12,2) not null,
  quantity integer not null default 1,
  total_price numeric(12,2) not null,
  created_at timestamptz not null default now()
);

create table if not exists payments (
  id uuid primary key default gen_random_uuid(),
  legacy_id text unique,
  payment_number text not null unique,
  order_id uuid not null references orders(id),
  amount numeric(12,2) not null check (amount > 0),
  payment_method text not null,
  reference text,
  received_by uuid not null references accounts(id),
  created_at timestamptz not null default now()
);

create table if not exists rewards_accounts (
  customer_id uuid primary key references accounts(id) on delete cascade,
  points_balance integer not null default 0,
  eligible_purchase_count integer not null default 0,
  free_rewards_available integer not null default 0,
  updated_at timestamptz not null default now()
);

create table if not exists vouchers (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references accounts(id) on delete cascade,
  voucher_code text not null unique,
  voucher_type text not null,
  fixed_value numeric(12,2),
  percentage_value numeric(6,2),
  free_item_id uuid references menu_items(id),
  status text not null default 'active',
  expires_at timestamptz,
  issued_at timestamptz not null default now()
);

create table if not exists notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references accounts(id) on delete cascade,
  type text not null,
  title text not null,
  message text not null,
  read boolean not null default false,
  related_order_id uuid references orders(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists audit_logs (
  id bigserial primary key,
  actor_id uuid references accounts(id),
  actor_role text not null,
  action text not null,
  entity_type text not null,
  entity_id text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists reporting_outbox (
  id bigserial primary key,
  topic text not null,
  entity_id text not null,
  payload jsonb not null,
  attempts integer not null default 0,
  available_at timestamptz not null default now(),
  completed_at timestamptz,
  last_error text,
  created_at timestamptz not null default now()
);

create index if not exists reporting_outbox_pending_idx
  on reporting_outbox(available_at, id) where completed_at is null;

alter table menu_items add column if not exists legacy_id text unique;
alter table orders add column if not exists legacy_id text unique;
alter table order_items add column if not exists legacy_id text unique;
alter table payments add column if not exists legacy_id text unique;

create or replace function set_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

drop trigger if exists accounts_set_updated_at on accounts;
create trigger accounts_set_updated_at before update on accounts
for each row execute function set_updated_at();
drop trigger if exists menu_items_set_updated_at on menu_items;
create trigger menu_items_set_updated_at before update on menu_items
for each row execute function set_updated_at();
drop trigger if exists orders_set_updated_at on orders;
create trigger orders_set_updated_at before update on orders
for each row execute function set_updated_at();
