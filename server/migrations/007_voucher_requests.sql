create table if not exists voucher_requests (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references accounts(id) on delete cascade,
  requested_by_user_id uuid not null references accounts(id),
  request_reason text,
  requested_reward_type text,
  status text not null default 'PENDING' check (status in ('PENDING','APPROVED','REJECTED','CANCELLED','FULFILLED')),
  reviewed_by_user_id uuid references accounts(id),
  reviewed_at timestamptz,
  rejection_reason text,
  created_voucher_id uuid references vouchers(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists voucher_requests_status_idx on voucher_requests(status, created_at desc);
create index if not exists voucher_requests_customer_idx on voucher_requests(customer_id, created_at desc);

drop trigger if exists voucher_requests_set_updated_at on voucher_requests;
create trigger voucher_requests_set_updated_at before update on voucher_requests
for each row execute function set_updated_at();
