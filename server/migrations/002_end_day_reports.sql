create table if not exists end_day_reports (
  id uuid primary key default gen_random_uuid(),
  business_date date not null unique,
  order_count integer not null,
  closed_order_count integer not null,
  cancelled_order_count integer not null,
  gross_sales numeric(12,2) not null,
  payments_received numeric(12,2) not null,
  loyalty_points_issued integer not null,
  performed_by uuid not null references accounts(id),
  performed_at timestamptz not null default now()
);

create index if not exists end_day_reports_performed_at_idx
  on end_day_reports(performed_at desc);
