update accounts
set account_status = 'guest'
where role = 'customer'
  and password_hash like 'migrated$%';

update accounts
set account_status = 'registered'
where role = 'customer'
  and password_hash is not null
  and password_hash not like 'migrated$%';
