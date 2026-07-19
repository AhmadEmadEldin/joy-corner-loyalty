-- Realtime is deliberately limited to customer-safe records and redacted staff
-- projections. Private notes and raw profiles are never published.
do $$
declare
  relation_name text;
begin
  foreach relation_name in array array[
    'orders',
    'payments',
    'rewards_accounts',
    'vouchers',
    'notifications',
    'cashier_order_queue',
    'kitchen_order_queue'
  ]
  loop
    if not exists (
      select 1
      from pg_catalog.pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = relation_name
    ) then
      execute format('alter publication supabase_realtime add table public.%I', relation_name);
    end if;
  end loop;
end $$;

alter table public.orders replica identity full;
alter table public.payments replica identity full;
alter table public.rewards_accounts replica identity full;
alter table public.vouchers replica identity full;
alter table public.notifications replica identity full;
alter table public.cashier_order_queue replica identity full;
alter table public.kitchen_order_queue replica identity full;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  (
    'menu-images',
    'menu-images',
    true,
    5242880,
    array['image/jpeg', 'image/png', 'image/webp', 'image/avif']
  ),
  (
    'payment-proofs',
    'payment-proofs',
    false,
    10485760,
    array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
  )
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy menu_images_public_read
on storage.objects for select to anon, authenticated
using (bucket_id = 'menu-images');

create policy menu_images_owner_insert
on storage.objects for insert to authenticated
with check (
  bucket_id = 'menu-images'
  and private.has_permission('menu.manage')
);

create policy menu_images_owner_update
on storage.objects for update to authenticated
using (bucket_id = 'menu-images' and private.has_permission('menu.manage'))
with check (bucket_id = 'menu-images' and private.has_permission('menu.manage'));

create policy menu_images_owner_delete
on storage.objects for delete to authenticated
using (bucket_id = 'menu-images' and private.has_permission('menu.manage'));

create policy payment_proofs_customer_insert
on storage.objects for insert to authenticated
with check (
  bucket_id = 'payment-proofs'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

create policy payment_proofs_customer_read
on storage.objects for select to authenticated
using (
  bucket_id = 'payment-proofs'
  and (
    (storage.foldername(name))[1] = (select auth.uid())::text
    or private.has_permission('payments.confirm')
  )
);

create policy payment_proofs_customer_update
on storage.objects for update to authenticated
using (
  bucket_id = 'payment-proofs'
  and (storage.foldername(name))[1] = (select auth.uid())::text
)
with check (
  bucket_id = 'payment-proofs'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

create policy payment_proofs_customer_delete
on storage.objects for delete to authenticated
using (
  bucket_id = 'payment-proofs'
  and (
    (storage.foldername(name))[1] = (select auth.uid())::text
    or private.is_owner()
  )
);

create or replace function public.update_customer_profile(
  full_name text,
  phone text,
  date_of_birth date default null,
  favorite_drink text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  changed public.profiles;
begin
  if actor_id is null then
    raise exception using errcode = '42501', message = 'Authentication is required.';
  end if;
  if nullif(trim(full_name), '') is null then
    raise exception using errcode = '22023', message = 'Full name is required.';
  end if;
  if nullif(regexp_replace(coalesce(phone, ''), '[^0-9+]', '', 'g'), '') is null then
    raise exception using errcode = '22023', message = 'A valid phone number is required.';
  end if;

  update public.profiles
  set
    full_name = trim(update_customer_profile.full_name),
    phone = regexp_replace(update_customer_profile.phone, '[^0-9+]', '', 'g'),
    date_of_birth = update_customer_profile.date_of_birth,
    favorite_drink = nullif(trim(update_customer_profile.favorite_drink), '')
  where id = actor_id and role = 'customer' and active = true
  returning * into changed;

  if not found then
    raise exception using errcode = '42501', message = 'An active customer profile is required.';
  end if;

  insert into public.audit_logs (actor_user_id, action, entity_type, entity_id, new_values)
  values (
    actor_id,
    'customer.profile.update',
    'profile',
    actor_id::text,
    jsonb_build_object(
      'fullName', changed.full_name,
      'phone', changed.phone,
      'dateOfBirth', changed.date_of_birth,
      'favoriteDrink', changed.favorite_drink
    )
  );

  return jsonb_build_object(
    'id', changed.id,
    'customerNumber', changed.customer_number,
    'fullName', changed.full_name,
    'phone', changed.phone,
    'email', changed.email,
    'dateOfBirth', changed.date_of_birth,
    'favoriteDrink', changed.favorite_drink
  );
end;
$$;

revoke all on function public.update_customer_profile(text, text, date, text) from public, anon;
grant execute on function public.update_customer_profile(text, text, date, text) to authenticated;

-- Staff roles are sourced only from protected auth app_metadata. The browser
-- cannot write app_metadata; the owner-only Edge Function uses Auth Admin.
create or replace function private.sync_profile_role_from_auth()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  requested_role public.app_role;
begin
  if coalesce(new.raw_app_meta_data->>'role', '') = any (
    array['owner', 'manager', 'cashier', 'waiter', 'barista', 'customer']
  ) then
    requested_role := (new.raw_app_meta_data->>'role')::public.app_role;
  else
    requested_role := 'customer';
  end if;

  update public.profiles
  set
    role = requested_role,
    customer_number = case
      when requested_role = 'customer' then coalesce(customer_number, private.next_customer_number())
      else null
    end,
    active = not coalesce((new.raw_app_meta_data->>'disabled')::boolean, false)
  where id = new.id;
  if requested_role = 'customer' then
    insert into public.rewards_accounts (customer_id) values (new.id)
    on conflict (customer_id) do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists sync_profile_role_after_auth_update on auth.users;
create trigger sync_profile_role_after_auth_update
after update of raw_app_meta_data on auth.users
for each row execute function private.sync_profile_role_from_auth();
