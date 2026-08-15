create table if not exists payroll_overrides (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references team_members(id) on delete cascade,
  period_start date not null,
  period_end date not null,
  manual_days numeric(6,2) check (manual_days is null or manual_days >= 0),
  manual_hours numeric(8,2) check (manual_hours is null or manual_hours >= 0),
  bonus numeric(12,2) not null default 0,
  deduction numeric(12,2) not null default 0,
  note text not null default '',
  updated_by uuid references accounts(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(employee_id, period_start, period_end),
  check (period_end >= period_start)
);

create index if not exists payroll_overrides_period_idx
  on payroll_overrides(period_start, period_end, employee_id);

drop trigger if exists payroll_overrides_set_updated_at on payroll_overrides;
create trigger payroll_overrides_set_updated_at before update on payroll_overrides
for each row execute function set_updated_at();
