do $$
begin
  if exists (
    select 1 from accounts
    where role = 'customer' and phone is not null
    group by phone having count(*) > 1
  ) then
    raise exception 'Duplicate customer phone numbers found. Resolve duplicates before applying this migration.';
  end if;
end $$;

create unique index if not exists accounts_customer_phone_unique
  on accounts(phone)
  where role = 'customer' and phone is not null;
