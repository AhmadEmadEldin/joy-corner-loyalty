alter table accounts
  add column if not exists account_status text,
  add column if not exists notes text;

update accounts
set account_status = case
  when role = 'customer' and email like '%@joycorner.local' then 'guest'
  else 'registered'
end
where account_status is null;

alter table accounts
  alter column account_status set default 'registered',
  alter column account_status set not null;

alter table accounts drop constraint if exists accounts_account_status_check;
alter table accounts add constraint accounts_account_status_check
  check (account_status in ('guest', 'registered'));

alter table accounts alter column email drop not null;
alter table accounts alter column password_hash drop not null;

-- Canonicalize Egyptian mobile numbers saved by older releases. Abort before
-- changing data if canonicalization would collapse two customer records.
do $$
begin
  if exists (
    select 1
    from accounts
    where role = 'customer' and phone ~ '^\+01[0125][0-9]{8}$'
      and exists (
        select 1 from accounts other
        where other.role = 'customer'
          and other.id <> accounts.id
          and other.phone = '+2' || substring(accounts.phone from 2)
      )
  ) then
    raise exception 'Egyptian phone normalization conflict found. Resolve duplicate customer records before applying migration 012.';
  end if;
end $$;

update accounts
set phone = '+2' || substring(phone from 2)
where role = 'customer' and phone ~ '^\+01[0125][0-9]{8}$';

create index if not exists accounts_customer_status_idx
  on accounts(account_status, created_at desc)
  where role = 'customer' and active = true;
