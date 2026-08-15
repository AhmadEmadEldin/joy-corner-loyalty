create table if not exists team_positions (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  color text not null default '#e0aa38',
  default_hourly_rate numeric(12,2) not null default 0 check (default_hourly_rate >= 0),
  description text not null default '',
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into team_positions(name,color,sort_order) values
  ('Manager','#e0aa38',10),('Cashier','#d97a35',20),
  ('Waiter','#4e9a50',30),('Barista','#9b6b43',40)
on conflict (name) do nothing;

create table if not exists team_members (
  id uuid primary key default gen_random_uuid(),
  account_id uuid unique references accounts(id) on delete set null,
  position_id uuid references team_positions(id) on delete set null,
  full_name text not null,
  email text,
  phone text,
  address text not null default '',
  emergency_contact text not null default '',
  government_id_last4 text not null default '',
  start_date date,
  status text not null default 'active' check (status in ('active','on_leave','inactive')),
  pay_type text not null default 'hourly' check (pay_type in ('hourly','daily','weekly','monthly','fixed')),
  pay_rate numeric(12,2) not null default 0 check (pay_rate >= 0),
  overtime_multiplier numeric(5,2) not null default 1.5 check (overtime_multiplier >= 1),
  max_weekly_hours numeric(6,2) not null default 40 check (max_weekly_hours > 0),
  calendar_color text not null default '#e0aa38',
  private_notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists team_shifts (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references team_members(id) on delete cascade,
  position_id uuid references team_positions(id) on delete set null,
  shift_date date not null,
  scheduled_start time not null,
  scheduled_end time not null,
  break_minutes integer not null default 0 check (break_minutes >= 0),
  actual_start time,
  actual_end time,
  actual_break_minutes integer check (actual_break_minutes >= 0),
  attendance_status text not null default 'scheduled' check (attendance_status in ('scheduled','worked','absent','paid_leave','unpaid_leave')),
  approved boolean not null default false,
  work_area text not null default '',
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (scheduled_end > scheduled_start),
  check (actual_end is null or actual_start is null or actual_end > actual_start)
);
create index if not exists team_shifts_date_employee_idx on team_shifts(shift_date,employee_id);

create table if not exists cleaning_tasks (
  id uuid primary key default gen_random_uuid(),
  task_date date not null,
  task_time time not null,
  area text not null default 'Bathroom',
  employee_id uuid references team_members(id) on delete set null,
  checklist jsonb not null default '[]'::jsonb,
  completed_at timestamptz,
  employee_initials text not null default '',
  manager_verified boolean not null default false,
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists cleaning_tasks_date_idx on cleaning_tasks(task_date,task_time);

drop trigger if exists team_positions_set_updated_at on team_positions;
create trigger team_positions_set_updated_at before update on team_positions
for each row execute function set_updated_at();
drop trigger if exists team_members_set_updated_at on team_members;
create trigger team_members_set_updated_at before update on team_members
for each row execute function set_updated_at();
drop trigger if exists team_shifts_set_updated_at on team_shifts;
create trigger team_shifts_set_updated_at before update on team_shifts
for each row execute function set_updated_at();
drop trigger if exists cleaning_tasks_set_updated_at on cleaning_tasks;
create trigger cleaning_tasks_set_updated_at before update on cleaning_tasks
for each row execute function set_updated_at();
