-- Joy Corner normalized reporting and backup schema for Neon PostgreSQL.
-- Apply this only to a server-side Neon database. Never expose the connection
-- string to browser code.

create table if not exists users (
  user_id text primary key,
  email text not null unique,
  display_name text not null,
  role text not null check (role in ('owner', 'manager', 'cashier', 'waiter', 'barista')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists roles (
  role_id text primary key,
  description text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists permissions (
  permission_id text primary key,
  description text not null default ''
);

create table if not exists role_permissions (
  role_id text not null references roles(role_id),
  permission_id text not null references permissions(permission_id),
  created_at timestamptz not null default now(),
  primary key (role_id, permission_id)
);

create table if not exists user_permissions (
  user_id text not null references users(user_id),
  permission_id text not null references permissions(permission_id),
  granted_by text references users(user_id),
  granted_at timestamptz not null default now(),
  revoked_at timestamptz,
  primary key (user_id, permission_id)
);

create table if not exists customers (
  customer_id text primary key,
  name text not null,
  phone text,
  email text,
  loyalty_points integer not null default 0,
  lifetime_orders integer not null default 0,
  lifetime_spend numeric(12,2) not null default 0,
  unpaid_balance numeric(12,2) not null default 0,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists menu_categories (
  category_id text primary key,
  name text not null unique,
  display_order integer not null default 0,
  active boolean not null default true,
  archived_at timestamptz
);

create table if not exists menu_items (
  menu_item_id text primary key,
  category_id text not null references menu_categories(category_id),
  name text not null,
  preparation_station text not null default 'barista',
  display_order integer not null default 0,
  active boolean not null default true,
  sold_out boolean not null default false,
  archived_at timestamptz
);

create table if not exists menu_item_sizes (
  menu_item_size_id text primary key,
  menu_item_id text not null references menu_items(menu_item_id),
  size_name text not null,
  price numeric(12,2) not null check (price >= 0),
  active boolean not null default true,
  unique (menu_item_id, size_name)
);

create table if not exists menu_item_flavors (
  menu_item_flavor_id text primary key,
  menu_item_id text not null references menu_items(menu_item_id),
  name text not null,
  active boolean not null default true,
  archived_at timestamptz,
  unique (menu_item_id, name)
);

create table if not exists extras (
  extra_id text primary key,
  name text not null unique,
  price numeric(12,2) not null check (price >= 0),
  active boolean not null default true
);

create table if not exists menu_item_extras (
  menu_item_id text not null references menu_items(menu_item_id),
  extra_id text not null references extras(extra_id),
  primary key (menu_item_id, extra_id)
);

create table if not exists business_days (
  business_date date primary key,
  status text not null check (status in ('open', 'closing', 'closed', 'archived')),
  opened_at timestamptz not null default now(),
  closed_at timestamptz,
  closed_by text references users(user_id)
);

create table if not exists orders (
  order_id text primary key,
  receipt_number text not null,
  idempotency_key text unique,
  business_date date not null references business_days(business_date),
  customer_id text references customers(customer_id),
  waiter_id text references users(user_id),
  cashier_id text references users(user_id),
  status text not null,
  subtotal numeric(12,2) not null default 0,
  discount numeric(12,2) not null default 0,
  tax numeric(12,2) not null default 0,
  total numeric(12,2) not null default 0,
  paid_amount numeric(12,2) not null default 0,
  unpaid_amount numeric(12,2) not null default 0,
  payment_status text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  closed_at timestamptz,
  archived_at timestamptz
);

create table if not exists order_items (
  order_item_id text primary key,
  order_id text not null references orders(order_id),
  menu_item_id text not null references menu_items(menu_item_id),
  menu_item_name text not null,
  category text not null,
  size_name text not null,
  quantity integer not null check (quantity > 0),
  unit_price numeric(12,2) not null check (unit_price >= 0),
  extras_total numeric(12,2) not null default 0,
  line_total numeric(12,2) not null check (line_total >= 0),
  notes text not null default '',
  preparation_status text not null default 'submitted'
);

create table if not exists order_item_extras (
  order_item_extra_id text primary key,
  order_item_id text not null references order_items(order_item_id),
  extra_id text not null references extras(extra_id),
  name text not null,
  quantity integer not null check (quantity > 0),
  unit_price numeric(12,2) not null check (unit_price >= 0),
  total numeric(12,2) not null check (total >= 0)
);

create table if not exists payments (
  payment_id text primary key,
  order_id text references orders(order_id),
  customer_id text references customers(customer_id),
  amount numeric(12,2) not null check (amount > 0),
  payment_method text not null,
  received_by text references users(user_id),
  status text not null default 'created',
  created_at timestamptz not null default now()
);

create table if not exists unpaid_accounts (
  unpaid_id text primary key,
  order_id text references orders(order_id),
  customer_id text not null references customers(customer_id),
  original_amount numeric(12,2) not null,
  paid_amount numeric(12,2) not null default 0,
  remaining_amount numeric(12,2) not null,
  status text not null default 'open',
  due_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists reward_transactions (
  reward_transaction_id text primary key,
  customer_id text not null references customers(customer_id),
  order_id text references orders(order_id),
  points_added integer not null default 0,
  points_removed integer not null default 0,
  balance_after integer not null,
  reason text not null,
  created_at timestamptz not null default now()
);

create table if not exists loyalty_winners (
  winner_id text primary key,
  customer_id text not null references customers(customer_id),
  customer_name text not null,
  reward_name text not null,
  qualification_reason text not null,
  status text not null default 'ready',
  created_at timestamptz not null default now()
);

create table if not exists reward_redemptions (
  redemption_id text primary key,
  customer_id text not null references customers(customer_id),
  reward_id text,
  reward_name text not null,
  points_used integer not null default 0,
  redeemed_by text references users(user_id),
  redeemed_at timestamptz not null default now(),
  status text not null default 'redeemed'
);

create table if not exists daily_archives (
  archive_id text primary key,
  business_date date not null unique references business_days(business_date),
  summary jsonb not null,
  archived_by text references users(user_id),
  archived_at timestamptz not null default now()
);

create table if not exists audit_logs (
  audit_id text primary key,
  user_id text references users(user_id),
  user_role text not null,
  action text not null,
  entity_type text not null,
  entity_id text,
  previous_value jsonb,
  new_value jsonb,
  success boolean not null,
  reason text,
  request_id text,
  session_metadata jsonb,
  created_at timestamptz not null default now()
);

create table if not exists sync_jobs (
  sync_job_id text primary key,
  source text not null,
  target text not null,
  status text not null,
  started_at timestamptz not null default now(),
  completed_at timestamptz
);

create table if not exists sync_failures (
  sync_failure_id text primary key,
  sync_job_id text references sync_jobs(sync_job_id),
  entity_type text not null,
  entity_id text,
  error_message text not null,
  retry_count integer not null default 0,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create index if not exists idx_orders_business_date on orders(business_date);
create index if not exists idx_orders_customer on orders(customer_id);
create index if not exists idx_payments_customer on payments(customer_id);
create index if not exists idx_unpaid_customer_status on unpaid_accounts(customer_id, status);
create index if not exists idx_audit_logs_entity on audit_logs(entity_type, entity_id);
create index if not exists idx_order_items_order on order_items(order_id);
create index if not exists idx_sync_failures_unresolved on sync_failures(entity_type, entity_id) where resolved_at is null;

insert into roles(role_id, description)
values
  ('owner', 'Full owner access'),
  ('manager', 'Manager access'),
  ('cashier', 'Cashier access'),
  ('waiter', 'Waiter access'),
  ('barista', 'Barista access')
on conflict (role_id) do nothing;
