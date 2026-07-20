-- Durable integration queue. Operational transactions only enqueue a compact
-- reference; reporting workers fetch and upsert the current row asynchronously.
-- Google Sheets and the optional Firebase backup can therefore fail without
-- failing or delaying an order.

create table public.integration_outbox (
  id bigint generated always as identity primary key,
  source_table text not null,
  record_id text not null,
  operation text not null check (operation in ('insert', 'update', 'delete')),
  status text not null default 'pending'
    check (status in ('pending', 'processing', 'completed', 'failed')),
  attempts integer not null default 0 check (attempts >= 0),
  available_at timestamptz not null default now(),
  locked_at timestamptz,
  locked_by text,
  completed_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint integration_outbox_source_table_length
    check (char_length(source_table) between 1 and 80),
  constraint integration_outbox_record_id_length
    check (char_length(record_id) between 1 and 200),
  constraint integration_outbox_worker_length
    check (locked_by is null or char_length(locked_by) between 1 and 100),
  constraint integration_outbox_error_length
    check (last_error is null or char_length(last_error) <= 2000)
);

alter table public.integration_outbox enable row level security;

revoke all on public.integration_outbox from public, anon, authenticated;
grant select, insert, update, delete on public.integration_outbox to service_role;
grant usage, select on sequence public.integration_outbox_id_seq to service_role;

create index integration_outbox_claim_idx
  on public.integration_outbox (available_at, id)
  where status in ('pending', 'failed');

create index integration_outbox_record_idx
  on public.integration_outbox (source_table, record_id, created_at desc);

create index integration_outbox_stale_claim_idx
  on public.integration_outbox (locked_at, id)
  where status = 'processing';

create or replace function private.enqueue_reporting_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  changed_json jsonb;
  changed_id text;
begin
  changed_json := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  changed_id := changed_json ->> 'id';

  if changed_id is null then
    raise exception using errcode = '22023', message = 'Reporting source row requires an id.';
  end if;

  -- Staff profiles are managed in Supabase Auth. Only customer profiles belong
  -- in the operational spreadsheet export.
  if tg_table_name = 'profiles'
     and coalesce(changed_json ->> 'role', '') <> 'customer' then
    if tg_op = 'DELETE' then return old; else return new; end if;
  end if;

  insert into public.integration_outbox (source_table, record_id, operation)
  values (tg_table_name, changed_id, lower(tg_op));

  if tg_op = 'DELETE' then return old; else return new; end if;
end;
$$;

revoke execute on function private.enqueue_reporting_change()
  from public, anon, authenticated, service_role;

do $$
declare
  relation_name text;
begin
  foreach relation_name in array array[
    'profiles',
    'orders',
    'order_items',
    'payments',
    'reward_transactions',
    'vouchers',
    'voucher_redemptions',
    'audit_logs'
  ]
  loop
    execute format(
      'drop trigger if exists enqueue_reporting_change on public.%I',
      relation_name
    );
    execute format(
      'create trigger enqueue_reporting_change after insert or update or delete on public.%I for each row execute function private.enqueue_reporting_change()',
      relation_name
    );
  end loop;
end;
$$;

create or replace function public.claim_integration_outbox(
  batch_size integer,
  worker_id text
)
returns setof public.integration_outbox
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if batch_size is null or batch_size < 1 or batch_size > 100 then
    raise exception using errcode = '22023', message = 'Batch size must be between 1 and 100.';
  end if;
  if nullif(trim(worker_id), '') is null or char_length(worker_id) > 100 then
    raise exception using errcode = '22023', message = 'A valid worker id is required.';
  end if;

  return query
  with claimed as (
    select queued.id
    from public.integration_outbox queued
    where (
        queued.status in ('pending', 'failed')
        and queued.available_at <= now()
      ) or (
        queued.status = 'processing'
        and queued.locked_at < now() - interval '15 minutes'
      )
    order by queued.available_at, queued.id
    limit batch_size
    for update skip locked
  )
  update public.integration_outbox queued
  set status = 'processing',
      attempts = queued.attempts + 1,
      locked_at = now(),
      locked_by = trim(worker_id),
      last_error = null,
      updated_at = now()
  from claimed
  where queued.id = claimed.id
  returning queued.*;
end;
$$;

create or replace function public.complete_integration_outbox(
  event_id bigint,
  worker_id text
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  update public.integration_outbox
  set status = 'completed',
      completed_at = now(),
      locked_at = null,
      locked_by = null,
      updated_at = now()
  where id = event_id
    and status = 'processing'
    and locked_by = complete_integration_outbox.worker_id;

  if not found then
    raise exception using errcode = 'P0002', message = 'Claimed integration event not found.';
  end if;
end;
$$;

create or replace function public.fail_integration_outbox(
  event_id bigint,
  worker_id text,
  error_message text
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  retry_count integer;
begin
  select attempts into retry_count
  from public.integration_outbox
  where id = event_id
    and status = 'processing'
    and locked_by = fail_integration_outbox.worker_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'Claimed integration event not found.';
  end if;

  update public.integration_outbox
  set status = 'failed',
      available_at = now() + make_interval(secs => least(3600, power(2, least(retry_count, 10))::integer * 15)),
      locked_at = null,
      locked_by = null,
      last_error = left(coalesce(error_message, 'Unknown reporting error'), 2000),
      updated_at = now()
  where id = event_id;
end;
$$;

revoke all on function public.claim_integration_outbox(integer, text)
  from public, anon, authenticated;
revoke all on function public.complete_integration_outbox(bigint, text)
  from public, anon, authenticated;
revoke all on function public.fail_integration_outbox(bigint, text, text)
  from public, anon, authenticated;

grant execute on function public.claim_integration_outbox(integer, text)
  to service_role;
grant execute on function public.complete_integration_outbox(bigint, text)
  to service_role;
grant execute on function public.fail_integration_outbox(bigint, text, text)
  to service_role;
