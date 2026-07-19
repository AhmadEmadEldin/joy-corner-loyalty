create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to authenticated;

insert into public.roles (name, description)
values
  ('owner', 'Full administrative access'),
  ('manager', 'Delegated operational management'),
  ('cashier', 'Order confirmation and payment collection'),
  ('waiter', 'Branch order entry'),
  ('barista', 'Confirmed kitchen queue preparation'),
  ('customer', 'Self-service ordering and account access')
on conflict (name) do update set description = excluded.description;

insert into public.permissions (permission_key, description)
values
  ('customers.phone.view', 'View customer phone numbers'),
  ('customers.email.view', 'View customer email addresses'),
  ('customers.history.view', 'View customer order history'),
  ('customers.rewards.view', 'View customer rewards'),
  ('customers.vouchers.view', 'View customer voucher history'),
  ('customers.unpaid.view', 'View customer unpaid balance'),
  ('customers.profile.edit', 'Edit customer profiles'),
  ('orders.create', 'Create branch orders'),
  ('orders.confirm', 'Confirm pending customer orders'),
  ('orders.reject', 'Reject pending customer orders'),
  ('orders.cancel_confirmed', 'Cancel confirmed orders'),
  ('orders.prepare', 'Advance preparation statuses'),
  ('orders.close', 'Close picked-up orders'),
  ('discounts.apply', 'Apply order discounts'),
  ('payments.confirm', 'Confirm payments'),
  ('vouchers.redeem', 'Redeem vouchers'),
  ('vouchers.issue', 'Issue loyalty vouchers'),
  ('reports.sales.view', 'View sales reports'),
  ('menu.manage', 'Manage menu data'),
  ('staff.manage', 'Manage staff accounts'),
  ('permissions.manage', 'Manage role and user permissions'),
  ('owner.override', 'Override order status with a reason')
on conflict (permission_key) do update set description = excluded.description;

insert into public.role_permissions (role_id, permission_id, enabled)
select r.id, p.id, true
from public.roles r
cross join public.permissions p
where r.name = 'owner'
on conflict (role_id, permission_id) do update set enabled = excluded.enabled;

insert into public.role_permissions (role_id, permission_id, enabled)
select r.id, p.id, true
from public.roles r
join public.permissions p on p.permission_key = any (
  case r.name
    when 'manager' then array[
      'customers.phone.view', 'customers.email.view', 'customers.history.view',
      'customers.rewards.view', 'customers.vouchers.view', 'customers.unpaid.view',
      'customers.profile.edit', 'orders.create', 'orders.confirm', 'orders.reject',
      'orders.cancel_confirmed', 'orders.prepare', 'orders.close',
      'discounts.apply', 'payments.confirm', 'vouchers.redeem',
      'vouchers.issue', 'reports.sales.view', 'menu.manage'
    ]::text[]
    when 'cashier' then array[
      'orders.create', 'orders.confirm', 'orders.reject', 'orders.close',
      'payments.confirm', 'vouchers.redeem'
    ]::text[]
    when 'waiter' then array['orders.create']::text[]
    when 'barista' then array['orders.prepare']::text[]
    else array[]::text[]
  end
)
where r.name in ('manager', 'cashier', 'waiter', 'barista')
on conflict (role_id, permission_id) do update set enabled = excluded.enabled;

insert into public.business_settings (setting_key, setting_value, description)
values
  ('currency', '"EGP"'::jsonb, 'Receipt currency'),
  ('loyalty_drinks_required', '7'::jsonb, 'Paid eligible drinks required per free reward'),
  ('points_egp_divisor', '10'::jsonb, 'EGP divisor used to calculate loyalty points')
on conflict (setting_key) do nothing;

create or replace function private.current_role()
returns public.app_role
language sql
stable
security definer
set search_path = ''
as $$
  select p.role
  from public.profiles p
  where p.id = (select auth.uid()) and p.active = true
$$;

create or replace function private.is_owner()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(private.current_role() = 'owner', false)
$$;

create or replace function private.has_permission(requested_permission text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  with actor as (
    select p.id, p.role
    from public.profiles p
    where p.id = (select auth.uid()) and p.active = true
  ),
  requested as (
    select id from public.permissions where permission_key = requested_permission
  ),
  user_override as (
    select up.enabled
    from public.user_permissions up, actor a, requested rp
    where up.user_id = a.id and up.permission_id = rp.id
  ),
  role_default as (
    select rp.enabled
    from public.role_permissions rp
    join public.roles r on r.id = rp.role_id
    join actor a on a.role = r.name
    join requested p on p.id = rp.permission_id
  )
  select coalesce(
    (select true from actor where role = 'owner'),
    (select enabled from user_override),
    (select enabled from role_default),
    false
  )
$$;

revoke all on function private.current_role() from public, anon;
revoke all on function private.is_owner() from public, anon;
revoke all on function private.has_permission(text) from public, anon;
grant execute on function private.current_role() to authenticated;
grant execute on function private.is_owner() to authenticated;
grant execute on function private.has_permission(text) to authenticated;

create or replace function private.next_customer_number()
returns text
language sql
volatile
security definer
set search_path = ''
as $$
  select 'CUST-' || lpad(nextval('public.customer_number_seq')::text, 6, '0')
$$;

create or replace function private.next_order_number()
returns text
language sql
volatile
security definer
set search_path = ''
as $$
  select 'JC-' || to_char(timezone('Africa/Cairo', now()), 'YYYYMMDD') || '-' ||
    lpad(nextval('public.order_number_seq')::text, 6, '0')
$$;

create or replace function private.next_payment_number()
returns text
language sql
volatile
security definer
set search_path = ''
as $$
  select 'PAY-' || to_char(timezone('Africa/Cairo', now()), 'YYYYMMDD') || '-' ||
    lpad(nextval('public.payment_number_seq')::text, 6, '0')
$$;

create or replace function private.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  assigned_role public.app_role := 'customer';
  normalized_phone text;
begin
  if new.raw_app_meta_data ? 'role'
    and (new.raw_app_meta_data->>'role') in ('owner','manager','cashier','waiter','barista') then
    assigned_role := (new.raw_app_meta_data->>'role')::public.app_role;
  end if;

  normalized_phone := nullif(regexp_replace(coalesce(new.raw_user_meta_data->>'phone', ''), '[^0-9+]', '', 'g'), '');

  insert into public.profiles (
    id, customer_number, full_name, phone, email, role, date_of_birth, favorite_drink
  ) values (
    new.id,
    case when assigned_role = 'customer' then private.next_customer_number() else null end,
    coalesce(nullif(trim(new.raw_user_meta_data->>'full_name'), ''), split_part(new.email, '@', 1)),
    normalized_phone,
    new.email,
    assigned_role,
    nullif(new.raw_user_meta_data->>'date_of_birth', '')::date,
    nullif(trim(new.raw_user_meta_data->>'favorite_drink'), '')
  );

  if assigned_role = 'customer' then
    insert into public.rewards_accounts (customer_id) values (new.id)
    on conflict (customer_id) do nothing;
  end if;
  return new;
exception
  when unique_violation then
    raise exception using
      errcode = '23505',
      message = 'A profile with this email or phone already exists.';
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function private.handle_new_auth_user();

create or replace function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

do $$
declare table_name text;
begin
  foreach table_name in array array[
    'profiles', 'role_permissions', 'user_permissions', 'business_settings',
    'menu_categories', 'menu_items', 'menu_item_sizes', 'menu_modifiers',
    'vouchers', 'orders', 'order_private_notes', 'rewards_accounts'
  ]
  loop
    execute format('drop trigger if exists set_updated_at on public.%I', table_name);
    execute format(
      'create trigger set_updated_at before update on public.%I for each row execute function private.set_updated_at()',
      table_name
    );
  end loop;
end $$;

create or replace function public.can_transition_order_status(
  old_status public.order_status,
  new_status public.order_status
)
returns boolean
language sql
immutable
security invoker
set search_path = ''
as $$
  select old_status = new_status or case old_status
    when 'draft' then new_status in ('pending_confirmation', 'cancelled')
    when 'pending_confirmation' then new_status in ('confirmed', 'rejected', 'cancelled')
    when 'confirmed' then new_status in ('accepted', 'cancelled')
    when 'accepted' then new_status in ('preparing', 'cancelled')
    when 'preparing' then new_status in ('ready', 'cancelled')
    when 'ready' then new_status in ('picked_up', 'cancelled')
    when 'picked_up' then new_status = 'closed'
    else false
  end
$$;

revoke all on function public.can_transition_order_status(public.order_status, public.order_status) from public;
grant execute on function public.can_transition_order_status(public.order_status, public.order_status) to authenticated, service_role;

create or replace function private.enforce_and_log_order_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  override_enabled boolean := coalesce(current_setting('app.owner_override', true), '') = 'on';
  transition_reason text := nullif(current_setting('app.status_reason', true), '');
begin
  if new.status is distinct from old.status then
    if not override_enabled and not public.can_transition_order_status(old.status, new.status) then
      raise exception using
        errcode = '22023',
        message = format('Invalid order status transition from %s to %s.', old.status, new.status);
    end if;
    insert into public.order_status_history (
      order_id, old_status, new_status, changed_by, reason
    ) values (
      new.id, old.status, new.status, (select auth.uid()), transition_reason
    );
  end if;
  return new;
end;
$$;

drop trigger if exists enforce_order_status on public.orders;
create trigger enforce_order_status
before update of status on public.orders
for each row execute function private.enforce_and_log_order_status();

create or replace function private.order_item_summary(target_order_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'itemId', oi.id,
      'name', oi.item_name_snapshot,
      'category', oi.category_name_snapshot,
      'size', oi.size_name,
      'quantity', oi.quantity,
      'customerNotes', oi.customer_notes,
      'preparationNotes', oi.preparation_notes,
      'modifiers', coalesce((
        select jsonb_agg(jsonb_build_object(
          'name', oim.modifier_name_snapshot,
          'quantity', oim.quantity
        ) order by oim.created_at)
        from public.order_item_modifiers oim
        where oim.order_item_id = oi.id
      ), '[]'::jsonb)
    ) order by oi.created_at
  ), '[]'::jsonb)
  from public.order_items oi
  where oi.order_id = target_order_id
$$;

create or replace function private.refresh_order_projections(target_order_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target public.orders;
  summary jsonb;
begin
  select * into target from public.orders where id = target_order_id;
  if not found then
    delete from public.cashier_order_queue where order_id = target_order_id;
    delete from public.kitchen_order_queue where order_id = target_order_id;
    return;
  end if;

  summary := private.order_item_summary(target_order_id);

  if target.status in ('closed', 'rejected', 'cancelled') then
    delete from public.cashier_order_queue where order_id = target.id;
  else
    insert into public.cashier_order_queue (
      order_id, order_number, pickup_name, status, confirmation_status,
      payment_status, subtotal, discount_total, voucher_discount, tax_total,
      total, payment_method, requested_voucher_id, customer_notes,
      item_summary, created_at, updated_at
    ) values (
      target.id, target.order_number, target.pickup_name, target.status,
      target.confirmation_status, target.payment_status, target.subtotal,
      target.discount_total, target.voucher_discount, target.tax_total,
      target.total, target.payment_method, target.requested_voucher_id,
      target.customer_notes, summary, target.created_at, target.updated_at
    )
    on conflict (order_id) do update set
      status = excluded.status,
      confirmation_status = excluded.confirmation_status,
      payment_status = excluded.payment_status,
      subtotal = excluded.subtotal,
      discount_total = excluded.discount_total,
      voucher_discount = excluded.voucher_discount,
      tax_total = excluded.tax_total,
      total = excluded.total,
      payment_method = excluded.payment_method,
      requested_voucher_id = excluded.requested_voucher_id,
      customer_notes = excluded.customer_notes,
      item_summary = excluded.item_summary,
      updated_at = excluded.updated_at;
  end if;

  if target.confirmation_status = 'confirmed'
    and target.kitchen_visible = true
    and target.status in ('confirmed', 'accepted', 'preparing', 'ready', 'picked_up') then
    insert into public.kitchen_order_queue (
      order_id, order_number, pickup_name, status, item_summary, order_time,
      accepted_at, preparing_at, ready_at, picked_up_at, updated_at
    ) values (
      target.id, target.order_number, split_part(target.pickup_name, ' ', 1),
      target.status, summary, target.created_at, target.accepted_at,
      target.preparing_at, target.ready_at, target.picked_up_at, target.updated_at
    )
    on conflict (order_id) do update set
      status = excluded.status,
      item_summary = excluded.item_summary,
      accepted_at = excluded.accepted_at,
      preparing_at = excluded.preparing_at,
      ready_at = excluded.ready_at,
      picked_up_at = excluded.picked_up_at,
      updated_at = excluded.updated_at;
  else
    delete from public.kitchen_order_queue where order_id = target.id;
  end if;
end;
$$;

create or replace function private.sync_order_projection_trigger()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.refresh_order_projections(coalesce(new.id, old.id));
  return coalesce(new, old);
end;
$$;

create or replace function private.sync_order_item_projection_trigger()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.refresh_order_projections(coalesce(new.order_id, old.order_id));
  return coalesce(new, old);
end;
$$;

drop trigger if exists sync_order_projection on public.orders;
create trigger sync_order_projection
after insert or update or delete on public.orders
for each row execute function private.sync_order_projection_trigger();

drop trigger if exists sync_order_item_projection on public.order_items;
create trigger sync_order_item_projection
after insert or update or delete on public.order_items
for each row execute function private.sync_order_item_projection_trigger();

create or replace function private.sync_modifier_projection_trigger()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare target_order_id uuid;
begin
  select oi.order_id into target_order_id
  from public.order_items oi
  where oi.id = coalesce(new.order_item_id, old.order_item_id);
  if target_order_id is not null then
    perform private.refresh_order_projections(target_order_id);
  end if;
  return coalesce(new, old);
end;
$$;

drop trigger if exists sync_modifier_projection on public.order_item_modifiers;
create trigger sync_modifier_projection
after insert or update or delete on public.order_item_modifiers
for each row execute function private.sync_modifier_projection_trigger();

-- RLS is enabled on every public table, including public menu data.
do $$
declare table_name text;
begin
  foreach table_name in array array[
    'roles','permissions','profiles','role_permissions','user_permissions',
    'business_settings','menu_categories','menu_items','menu_item_sizes',
    'menu_modifiers','menu_item_modifiers','vouchers','orders',
    'order_private_notes','order_items','order_item_modifiers','payments',
    'rewards_accounts','reward_transactions','voucher_redemptions',
    'notifications','order_status_history','audit_logs','operation_requests',
    'cashier_order_queue','kitchen_order_queue','migration_runs','migration_failures'
  ]
  loop
    execute format('alter table public.%I enable row level security', table_name);
  end loop;
end $$;

create policy profiles_read_own on public.profiles
for select to authenticated
using ((select auth.uid()) = id);

create policy profiles_update_own on public.profiles
for update to authenticated
using ((select auth.uid()) = id and role = 'customer' and active = true)
with check (
  (select auth.uid()) = id
  and role = 'customer'
  and active = true
);

create policy profiles_owner_all on public.profiles
for all to authenticated
using (private.is_owner())
with check (private.is_owner());

create policy owner_roles on public.roles for all to authenticated
using (private.is_owner()) with check (private.is_owner());
create policy owner_permissions on public.permissions for all to authenticated
using (private.is_owner()) with check (private.is_owner());
create policy owner_role_permissions on public.role_permissions for all to authenticated
using (private.is_owner()) with check (private.is_owner());
create policy owner_user_permissions on public.user_permissions for all to authenticated
using (private.is_owner()) with check (private.is_owner());
create policy owner_settings on public.business_settings for all to authenticated
using (private.is_owner()) with check (private.is_owner());

create policy menu_categories_public_read on public.menu_categories
for select to anon, authenticated using (active = true and archived_at is null);
create policy menu_items_public_read on public.menu_items
for select to anon, authenticated using (active = true and available = true and archived_at is null);
create policy menu_sizes_public_read on public.menu_item_sizes
for select to anon, authenticated using (
  active = true and exists (
    select 1 from public.menu_items mi
    where mi.id = menu_item_id and mi.active = true and mi.available = true and mi.archived_at is null
  )
);
create policy menu_modifiers_public_read on public.menu_modifiers
for select to anon, authenticated using (active = true);
create policy menu_item_modifiers_public_read on public.menu_item_modifiers
for select to anon, authenticated using (
  exists (select 1 from public.menu_items mi where mi.id = menu_item_id and mi.active and mi.available)
  and exists (select 1 from public.menu_modifiers mm where mm.id = modifier_id and mm.active)
);

create policy menu_categories_owner_manage on public.menu_categories for all to authenticated
using (private.has_permission('menu.manage')) with check (private.has_permission('menu.manage'));
create policy menu_items_owner_manage on public.menu_items for all to authenticated
using (private.has_permission('menu.manage')) with check (private.has_permission('menu.manage'));
create policy menu_sizes_owner_manage on public.menu_item_sizes for all to authenticated
using (private.has_permission('menu.manage')) with check (private.has_permission('menu.manage'));
create policy menu_modifiers_owner_manage on public.menu_modifiers for all to authenticated
using (private.has_permission('menu.manage')) with check (private.has_permission('menu.manage'));
create policy menu_item_modifiers_owner_manage on public.menu_item_modifiers for all to authenticated
using (private.has_permission('menu.manage')) with check (private.has_permission('menu.manage'));

create policy orders_customer_read on public.orders for select to authenticated
using (customer_id = (select auth.uid()));
create policy orders_owner_all on public.orders for all to authenticated
using (private.is_owner()) with check (private.is_owner());

create policy order_items_customer_read on public.order_items for select to authenticated
using (exists (
  select 1 from public.orders o
  where o.id = order_id and o.customer_id = (select auth.uid())
));
create policy order_items_owner_all on public.order_items for all to authenticated
using (private.is_owner()) with check (private.is_owner());

create policy order_item_modifiers_customer_read on public.order_item_modifiers for select to authenticated
using (exists (
  select 1
  from public.order_items oi
  join public.orders o on o.id = oi.order_id
  where oi.id = order_item_id and o.customer_id = (select auth.uid())
));
create policy order_item_modifiers_owner_all on public.order_item_modifiers for all to authenticated
using (private.is_owner()) with check (private.is_owner());

create policy private_notes_owner on public.order_private_notes for all to authenticated
using (private.is_owner()) with check (private.is_owner());

create policy payments_customer_read on public.payments for select to authenticated
using (customer_id = (select auth.uid()));
create policy payments_authorized_staff_read on public.payments for select to authenticated
using (private.has_permission('payments.confirm') or private.is_owner());
create policy payments_owner_all on public.payments for all to authenticated
using (private.is_owner()) with check (private.is_owner());

create policy rewards_accounts_customer_read on public.rewards_accounts for select to authenticated
using (customer_id = (select auth.uid()));
create policy rewards_accounts_owner_all on public.rewards_accounts for all to authenticated
using (private.is_owner()) with check (private.is_owner());
create policy reward_transactions_customer_read on public.reward_transactions for select to authenticated
using (customer_id = (select auth.uid()));
create policy reward_transactions_owner_all on public.reward_transactions for all to authenticated
using (private.is_owner()) with check (private.is_owner());

create policy vouchers_customer_read on public.vouchers for select to authenticated
using (customer_id = (select auth.uid()));
create policy vouchers_owner_all on public.vouchers for all to authenticated
using (private.is_owner()) with check (private.is_owner());
create policy voucher_redemptions_customer_read on public.voucher_redemptions for select to authenticated
using (customer_id = (select auth.uid()));
create policy voucher_redemptions_owner_all on public.voucher_redemptions for all to authenticated
using (private.is_owner()) with check (private.is_owner());

create policy notifications_own_read on public.notifications for select to authenticated
using (user_id = (select auth.uid()));
create policy notifications_own_update on public.notifications for update to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));
create policy notifications_owner_all on public.notifications for all to authenticated
using (private.is_owner()) with check (private.is_owner());

create policy status_history_customer_read on public.order_status_history for select to authenticated
using (exists (
  select 1 from public.orders o
  where o.id = order_id and o.customer_id = (select auth.uid())
));
create policy status_history_owner_all on public.order_status_history for all to authenticated
using (private.is_owner()) with check (private.is_owner());

create policy audit_owner_read on public.audit_logs for select to authenticated
using (private.is_owner());

create policy cashier_queue_read on public.cashier_order_queue for select to authenticated
using (private.current_role() in ('owner', 'manager', 'cashier'));
create policy kitchen_queue_read on public.kitchen_order_queue for select to authenticated
using (private.current_role() in ('owner', 'manager', 'barista'));

-- Explicit grants are required for new Supabase projects. RLS remains the
-- authorization boundary after these Data API grants.
grant select on public.menu_categories, public.menu_items, public.menu_item_sizes,
  public.menu_modifiers, public.menu_item_modifiers to anon, authenticated;
grant select on public.profiles, public.roles, public.permissions,
  public.role_permissions, public.user_permissions, public.business_settings,
  public.orders, public.order_items, public.order_item_modifiers, public.payments,
  public.rewards_accounts, public.reward_transactions, public.vouchers,
  public.voucher_redemptions, public.notifications, public.order_status_history,
  public.audit_logs, public.cashier_order_queue, public.kitchen_order_queue
  to authenticated;
grant update (full_name, phone, date_of_birth, favorite_drink, last_login_at)
  on public.profiles to authenticated;
grant update (read) on public.notifications to authenticated;
grant insert, update, delete on public.menu_categories, public.menu_items,
  public.menu_item_sizes, public.menu_modifiers, public.menu_item_modifiers
  to authenticated;

create or replace function public.place_customer_order(
  items jsonb,
  selected_payment_method public.payment_method,
  customer_notes text,
  requested_voucher_code text,
  idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor public.profiles;
  existing_order public.orders;
  created_order public.orders;
  item jsonb;
  modifier_id_text text;
  menu_row record;
  modifier_row record;
  created_item_id uuid;
  quantity_value integer;
  modifier_unit_total numeric(12,2);
  subtotal_value numeric(12,2) := 0;
  requested_voucher_id uuid;
begin
  select * into actor from public.profiles
  where id = (select auth.uid()) and active = true and role = 'customer';
  if not found then
    raise exception using errcode = '42501', message = 'Only active customer accounts can place customer orders.';
  end if;
  if idempotency_key is null or char_length(idempotency_key) < 8 then
    raise exception using errcode = '22023', message = 'A valid idempotency key is required.';
  end if;
  select * into existing_order
  from public.orders
  where orders.idempotency_key = place_customer_order.idempotency_key
    and customer_id = actor.id;
  if found then
    return jsonb_build_object('orderId', existing_order.id, 'orderNumber', existing_order.order_number, 'duplicate', true);
  end if;
  if jsonb_typeof(items) <> 'array' or jsonb_array_length(items) = 0 then
    raise exception using errcode = '22023', message = 'At least one order item is required.';
  end if;

  if nullif(trim(requested_voucher_code), '') is not null then
    select v.id into requested_voucher_id
    from public.vouchers v
    where v.voucher_code = upper(trim(requested_voucher_code))
      and v.customer_id = actor.id
      and v.status = 'active'
      and (v.expires_at is null or v.expires_at > now());
    if requested_voucher_id is null then
      raise exception using errcode = '22023', message = 'The requested voucher is not valid for this customer.';
    end if;
  end if;

  insert into public.orders (
    order_number, customer_id, pickup_name, source, status,
    confirmation_status, payment_status, kitchen_visible, payment_method,
    requested_voucher_id, customer_notes, idempotency_key
  ) values (
    private.next_order_number(), actor.id, actor.full_name, 'customer_app',
    'pending_confirmation', 'pending', 'unpaid', false,
    selected_payment_method, requested_voucher_id, coalesce(customer_notes, ''),
    idempotency_key
  ) returning * into created_order;

  for item in select value from jsonb_array_elements(items)
  loop
    quantity_value := coalesce((item->>'quantity')::integer, 0);
    if quantity_value <= 0 or quantity_value > 99 then
      raise exception using errcode = '22023', message = 'Item quantity must be between 1 and 99.';
    end if;

    select
      mi.id as menu_item_id, mi.name as item_name, mc.name as category_name,
      mi.loyalty_eligible, mis.size_name, mis.price
    into menu_row
    from public.menu_item_sizes mis
    join public.menu_items mi on mi.id = mis.menu_item_id
    join public.menu_categories mc on mc.id = mi.category_id
    where mis.id = (item->>'sizeId')::uuid
      and mis.active = true and mi.active = true and mi.available = true
      and mi.archived_at is null and mc.active = true and mc.archived_at is null;
    if not found then
      raise exception using errcode = '22023', message = 'A selected menu item or size is no longer available.';
    end if;

    modifier_unit_total := 0;
    for modifier_id_text in
      select jsonb_array_elements_text(coalesce(item->'modifierIds', '[]'::jsonb))
    loop
      select mm.id, mm.name, mm.price into modifier_row
      from public.menu_modifiers mm
      join public.menu_item_modifiers mim on mim.modifier_id = mm.id
      where mim.menu_item_id = menu_row.menu_item_id
        and mm.id = modifier_id_text::uuid and mm.active = true;
      if not found then
        raise exception using errcode = '22023', message = 'A selected modifier is unavailable for this item.';
      end if;
      modifier_unit_total := modifier_unit_total + modifier_row.price;
    end loop;

    insert into public.order_items (
      order_id, menu_item_id, item_name_snapshot, category_name_snapshot,
      size_name, quantity, unit_price, modifiers_total, total_price,
      loyalty_eligible, customer_notes, preparation_notes
    ) values (
      created_order.id, menu_row.menu_item_id, menu_row.item_name,
      menu_row.category_name, menu_row.size_name, quantity_value,
      menu_row.price, modifier_unit_total,
      quantity_value * (menu_row.price + modifier_unit_total),
      menu_row.loyalty_eligible, coalesce(item->>'notes', ''),
      coalesce(item->>'preparationNotes', '')
    ) returning id into created_item_id;

    for modifier_id_text in
      select jsonb_array_elements_text(coalesce(item->'modifierIds', '[]'::jsonb))
    loop
      select mm.id, mm.name, mm.price into modifier_row
      from public.menu_modifiers mm where mm.id = modifier_id_text::uuid;
      insert into public.order_item_modifiers (
        order_item_id, modifier_id, modifier_name_snapshot, unit_price,
        quantity, total_price
      ) values (
        created_item_id, modifier_row.id, modifier_row.name, modifier_row.price,
        1, modifier_row.price
      );
    end loop;

    subtotal_value := subtotal_value + quantity_value * (menu_row.price + modifier_unit_total);
  end loop;

  update public.orders
  set subtotal = subtotal_value, total = subtotal_value
  where id = created_order.id
  returning * into created_order;

  insert into public.order_status_history (order_id, old_status, new_status, changed_by, reason)
  values (created_order.id, null, 'pending_confirmation', actor.id, 'Customer submitted order');
  insert into public.audit_logs (actor_user_id, action, entity_type, entity_id, new_values)
  values (actor.id, 'order.create', 'order', created_order.id::text, to_jsonb(created_order));
  insert into public.notifications (user_id, type, title, message, related_order_id)
  values (actor.id, 'order_created', 'Order received', 'Your order is waiting for cashier confirmation.', created_order.id);

  return jsonb_build_object(
    'orderId', created_order.id,
    'orderNumber', created_order.order_number,
    'status', created_order.status,
    'total', created_order.total,
    'duplicate', false
  );
end;
$$;

revoke all on function public.place_customer_order(jsonb, public.payment_method, text, text, text) from public, anon;
grant execute on function public.place_customer_order(jsonb, public.payment_method, text, text, text) to authenticated;

create or replace function public.create_staff_order(
  customer_id uuid,
  pickup_name text,
  items jsonb,
  selected_payment_method public.payment_method,
  customer_notes text,
  idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor public.profiles;
  existing_response jsonb;
  created_order public.orders;
  item jsonb;
  menu_row record;
  modifier_row record;
  modifier_id_text text;
  created_item_id uuid;
  quantity_value integer;
  modifier_unit_total numeric(12,2);
  subtotal_value numeric(12,2) := 0;
  response_value jsonb;
begin
  select * into actor from public.profiles where id = (select auth.uid()) and active;
  if not found or not private.has_permission('orders.create') then
    raise exception using errcode = '42501', message = 'Order creation permission is required.';
  end if;
  if idempotency_key is null or char_length(idempotency_key) < 8 then
    raise exception using errcode = '22023', message = 'A valid idempotency key is required.';
  end if;
  select response into existing_response from public.operation_requests
  where actor_user_id = actor.id and action = 'order.staff.create'
    and operation_requests.idempotency_key = create_staff_order.idempotency_key;
  if found then return existing_response; end if;
  if nullif(trim(pickup_name), '') is null then
    raise exception using errcode = '22023', message = 'Pickup name is required.';
  end if;
  if jsonb_typeof(items) <> 'array' or jsonb_array_length(items) = 0 then
    raise exception using errcode = '22023', message = 'At least one order item is required.';
  end if;
  if customer_id is not null and not exists (
    select 1 from public.profiles p where p.id = create_staff_order.customer_id and p.role = 'customer' and p.active
  ) then
    raise exception using errcode = '22023', message = 'Selected customer is not active.';
  end if;

  insert into public.orders (
    order_number, customer_id, pickup_name, source, status,
    confirmation_status, payment_status, kitchen_visible, payment_method,
    confirmed_by, confirmed_at, customer_notes, idempotency_key
  ) values (
    private.next_order_number(), customer_id, trim(pickup_name),
    case actor.role when 'waiter' then 'waiter'::public.order_source
      when 'owner' then 'owner'::public.order_source else 'cashier'::public.order_source end,
    'confirmed', 'confirmed', 'unpaid', true, selected_payment_method,
    actor.id, now(), coalesce(customer_notes, ''), idempotency_key
  ) returning * into created_order;

  for item in select value from jsonb_array_elements(items)
  loop
    quantity_value := coalesce((item->>'quantity')::integer, 0);
    if quantity_value <= 0 or quantity_value > 99 then
      raise exception using errcode = '22023', message = 'Item quantity must be between 1 and 99.';
    end if;
    select mi.id as menu_item_id, mi.name as item_name, mc.name as category_name,
      mi.loyalty_eligible, mis.size_name, mis.price
    into menu_row
    from public.menu_item_sizes mis
    join public.menu_items mi on mi.id = mis.menu_item_id
    join public.menu_categories mc on mc.id = mi.category_id
    where mis.id = (item->>'sizeId')::uuid and mis.active
      and mi.active and mi.available and mi.archived_at is null
      and mc.active and mc.archived_at is null;
    if not found then
      raise exception using errcode = '22023', message = 'A selected menu item or size is unavailable.';
    end if;

    modifier_unit_total := 0;
    for modifier_id_text in select jsonb_array_elements_text(coalesce(item->'modifierIds', '[]'::jsonb))
    loop
      select mm.id, mm.name, mm.price into modifier_row
      from public.menu_modifiers mm
      join public.menu_item_modifiers mim on mim.modifier_id = mm.id
      where mim.menu_item_id = menu_row.menu_item_id
        and mm.id = modifier_id_text::uuid and mm.active;
      if not found then
        raise exception using errcode = '22023', message = 'A selected modifier is unavailable.';
      end if;
      modifier_unit_total := modifier_unit_total + modifier_row.price;
    end loop;

    insert into public.order_items (
      order_id, menu_item_id, item_name_snapshot, category_name_snapshot,
      size_name, quantity, unit_price, modifiers_total, total_price,
      loyalty_eligible, customer_notes, preparation_notes
    ) values (
      created_order.id, menu_row.menu_item_id, menu_row.item_name,
      menu_row.category_name, menu_row.size_name, quantity_value,
      menu_row.price, modifier_unit_total,
      quantity_value * (menu_row.price + modifier_unit_total),
      menu_row.loyalty_eligible, coalesce(item->>'notes', ''),
      coalesce(item->>'preparationNotes', '')
    ) returning id into created_item_id;

    for modifier_id_text in select jsonb_array_elements_text(coalesce(item->'modifierIds', '[]'::jsonb))
    loop
      select mm.id, mm.name, mm.price into modifier_row
      from public.menu_modifiers mm where mm.id = modifier_id_text::uuid;
      insert into public.order_item_modifiers (
        order_item_id, modifier_id, modifier_name_snapshot, unit_price, quantity, total_price
      ) values (created_item_id, modifier_row.id, modifier_row.name, modifier_row.price, 1, modifier_row.price);
    end loop;
    subtotal_value := subtotal_value + quantity_value * (menu_row.price + modifier_unit_total);
  end loop;

  update public.orders set subtotal = subtotal_value, total = subtotal_value
  where id = created_order.id returning * into created_order;
  insert into public.order_status_history (order_id, old_status, new_status, changed_by, reason)
  values (created_order.id, null, 'confirmed', actor.id, 'Staff created branch order');
  insert into public.audit_logs (actor_user_id, action, entity_type, entity_id, new_values)
  values (actor.id, 'order.staff.create', 'order', created_order.id::text, to_jsonb(created_order));
  response_value := jsonb_build_object(
    'orderId', created_order.id, 'orderNumber', created_order.order_number,
    'status', created_order.status, 'total', created_order.total
  );
  insert into public.operation_requests (actor_user_id, action, idempotency_key, response)
  values (actor.id, 'order.staff.create', idempotency_key, response_value);
  return response_value;
end;
$$;

revoke all on function public.create_staff_order(uuid, text, jsonb, public.payment_method, text, text) from public, anon;
grant execute on function public.create_staff_order(uuid, text, jsonb, public.payment_method, text, text) to authenticated;

create or replace function private.calculate_rewards_for_order(target_order_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  target public.orders;
  eligible_count integer;
  points_value integer;
  threshold_value integer;
  divisor_value integer;
  account public.rewards_accounts;
  new_rewards integer;
begin
  select * into target from public.orders where id = target_order_id for update;
  if not found or target.customer_id is null
    or target.status <> 'closed' or target.payment_status <> 'paid' then
    return jsonb_build_object('awarded', false, 'reason', 'Order is not both paid and closed.');
  end if;
  if exists (
    select 1 from public.reward_transactions
    where order_id = target.id and transaction_type = 'earn'
  ) then
    return jsonb_build_object('awarded', false, 'duplicate', true);
  end if;

  select coalesce(sum(quantity), 0)::integer into eligible_count
  from public.order_items where order_id = target.id and loyalty_eligible = true;
  select coalesce((setting_value #>> '{}')::integer, 7) into threshold_value
  from public.business_settings where setting_key = 'loyalty_drinks_required';
  select coalesce((setting_value #>> '{}')::integer, 10) into divisor_value
  from public.business_settings where setting_key = 'points_egp_divisor';
  points_value := floor(target.total / greatest(divisor_value, 1))::integer;

  insert into public.rewards_accounts (customer_id)
  values (target.customer_id)
  on conflict (customer_id) do nothing;
  select * into account from public.rewards_accounts
  where customer_id = target.customer_id for update;
  new_rewards :=
    ((account.eligible_purchase_count + eligible_count) / greatest(threshold_value, 1))
    - (account.eligible_purchase_count / greatest(threshold_value, 1));

  update public.rewards_accounts
  set points_balance = points_balance + points_value,
      eligible_purchase_count = eligible_purchase_count + eligible_count,
      free_rewards_available = free_rewards_available + new_rewards
  where customer_id = target.customer_id;

  insert into public.reward_transactions (
    customer_id, order_id, transaction_type, points,
    eligible_purchase_change, free_reward_change, description, created_by,
    idempotency_key
  ) values (
    target.customer_id, target.id, 'earn', points_value, eligible_count,
    new_rewards, 'Rewards granted after paid and closed order.', (select auth.uid()),
    'order-reward:' || target.id::text
  );
  return jsonb_build_object(
    'awarded', true, 'points', points_value,
    'eligiblePurchases', eligible_count, 'freeRewards', new_rewards
  );
end;
$$;

create or replace function public.change_order_status(
  target_order_id uuid,
  requested_status public.order_status,
  reason text,
  idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor public.profiles;
  target public.orders;
  previous_status public.order_status;
  existing_response jsonb;
  response_value jsonb;
begin
  select * into actor from public.profiles
  where id = (select auth.uid()) and active = true;
  if not found then raise exception using errcode = '42501', message = 'Authentication is required.'; end if;
  if idempotency_key is null or char_length(idempotency_key) < 8 then
    raise exception using errcode = '22023', message = 'A valid idempotency key is required.';
  end if;
  select response into existing_response from public.operation_requests
  where actor_user_id = actor.id and action = 'order.status'
    and operation_requests.idempotency_key = change_order_status.idempotency_key;
  if found then return existing_response; end if;

  select * into target from public.orders where id = target_order_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'Order not found.'; end if;

  if requested_status = 'cancelled'
    and actor.role = 'customer'
    and target.customer_id = actor.id
    and target.status = 'pending_confirmation' then
    null;
  elsif requested_status in ('confirmed', 'rejected')
    and private.has_permission(case when requested_status = 'confirmed' then 'orders.confirm' else 'orders.reject' end) then
    null;
  elsif requested_status in ('accepted', 'preparing', 'ready', 'picked_up')
    and actor.role in ('owner', 'manager', 'barista')
    and private.has_permission('orders.prepare') then
    null;
  elsif requested_status = 'closed' and private.has_permission('orders.close') then
    null;
  elsif requested_status = 'cancelled' and private.has_permission('orders.cancel_confirmed') then
    null;
  else
    raise exception using errcode = '42501', message = 'You are not permitted to perform this status change.';
  end if;

  if requested_status in ('rejected', 'cancelled') and nullif(trim(reason), '') is null then
    raise exception using errcode = '22023', message = 'A reason is required.';
  end if;
  if not public.can_transition_order_status(target.status, requested_status) then
    raise exception using errcode = '22023',
      message = format('Invalid order status transition from %s to %s.', target.status, requested_status);
  end if;

  previous_status := target.status;
  perform set_config('app.status_reason', coalesce(reason, ''), true);
  update public.orders set
    status = requested_status,
    confirmation_status = case
      when requested_status = 'confirmed' then 'confirmed'
      when requested_status = 'rejected' then 'rejected'
      when requested_status = 'cancelled' then 'cancelled'
      else confirmation_status end,
    kitchen_visible = case
      when requested_status = 'confirmed' then true
      when requested_status in ('rejected', 'cancelled', 'closed') then false
      else kitchen_visible end,
    confirmed_by = case when requested_status = 'confirmed' then actor.id else confirmed_by end,
    confirmed_at = case when requested_status = 'confirmed' then now() else confirmed_at end,
    assigned_barista_id = case when requested_status = 'accepted' and actor.role = 'barista' then actor.id else assigned_barista_id end,
    accepted_at = case when requested_status = 'accepted' then now() else accepted_at end,
    preparing_at = case when requested_status = 'preparing' then now() else preparing_at end,
    ready_at = case when requested_status = 'ready' then now() else ready_at end,
    picked_up_at = case when requested_status = 'picked_up' then now() else picked_up_at end,
    closed_at = case when requested_status = 'closed' then now() else closed_at end,
    rejected_at = case when requested_status = 'rejected' then now() else rejected_at end,
    rejection_reason = case when requested_status = 'rejected' then trim(reason) else rejection_reason end,
    cancelled_at = case when requested_status = 'cancelled' then now() else cancelled_at end,
    cancellation_reason = case when requested_status = 'cancelled' then trim(reason) else cancellation_reason end
  where id = target.id returning * into target;

  if requested_status = 'closed' then perform private.calculate_rewards_for_order(target.id); end if;
  insert into public.audit_logs (actor_user_id, action, entity_type, entity_id, old_values, new_values, metadata)
  values (
    actor.id, 'order.status.change', 'order', target.id::text,
    jsonb_build_object('status', previous_status), jsonb_build_object('status', requested_status),
    jsonb_build_object('reason', reason)
  );
  insert into public.notifications (user_id, type, title, message, related_order_id)
  select target.customer_id, 'order_status', 'Order status updated',
    'Order ' || target.order_number || ' is now ' || replace(requested_status::text, '_', ' ') || '.', target.id
  where target.customer_id is not null;

  response_value := jsonb_build_object(
    'orderId', target.id, 'orderNumber', target.order_number,
    'status', target.status, 'confirmationStatus', target.confirmation_status
  );
  insert into public.operation_requests (actor_user_id, action, idempotency_key, response)
  values (actor.id, 'order.status', idempotency_key, response_value);
  return response_value;
end;
$$;

revoke all on function public.change_order_status(uuid, public.order_status, text, text) from public, anon;
grant execute on function public.change_order_status(uuid, public.order_status, text, text) to authenticated;

create or replace function public.confirm_order_payment(
  target_order_id uuid,
  amount numeric,
  selected_payment_method public.payment_method,
  reference text,
  proof_url text,
  idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor public.profiles;
  target public.orders;
  payment public.payments;
  paid_total numeric(12,2);
  response_value jsonb;
begin
  select * into actor from public.profiles where id = (select auth.uid()) and active;
  if not found or not private.has_permission('payments.confirm') then
    raise exception using errcode = '42501', message = 'Payment confirmation permission is required.';
  end if;
  if idempotency_key is null or char_length(idempotency_key) < 8 then
    raise exception using errcode = '22023', message = 'A valid idempotency key is required.';
  end if;
  if amount <= 0 then raise exception using errcode = '22023', message = 'Payment amount must be greater than zero.'; end if;
  select * into target from public.orders where id = target_order_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'Order not found.'; end if;

  select * into payment from public.payments
  where payments.idempotency_key = confirm_order_payment.idempotency_key;
  if found then
    return jsonb_build_object('paymentId', payment.id, 'paymentNumber', payment.payment_number, 'duplicate', true);
  end if;

  insert into public.payments (
    payment_number, order_id, customer_id, amount, payment_method, status,
    reference, proof_url, confirmed_by, confirmed_at, idempotency_key
  ) values (
    private.next_payment_number(), target.id, target.customer_id, amount,
    selected_payment_method, 'confirmed', nullif(trim(reference), ''),
    nullif(trim(proof_url), ''), actor.id, now(), idempotency_key
  ) returning * into payment;

  select coalesce(sum(p.amount), 0) into paid_total
  from public.payments p where p.order_id = target.id and p.status = 'confirmed';
  update public.orders
  set payment_status = case
    when paid_total >= total then 'paid'::public.payment_status
    when paid_total > 0 then 'partially_paid'::public.payment_status
    else 'unpaid'::public.payment_status end
  where id = target.id returning * into target;
  if target.status = 'closed' and target.payment_status = 'paid' then
    perform private.calculate_rewards_for_order(target.id);
  end if;
  insert into public.audit_logs (actor_user_id, action, entity_type, entity_id, new_values)
  values (actor.id, 'payment.confirm', 'payment', payment.id::text, to_jsonb(payment));
  response_value := jsonb_build_object(
    'paymentId', payment.id, 'paymentNumber', payment.payment_number,
    'paymentStatus', target.payment_status, 'duplicate', false
  );
  return response_value;
end;
$$;

revoke all on function public.confirm_order_payment(uuid, numeric, public.payment_method, text, text, text) from public, anon;
grant execute on function public.confirm_order_payment(uuid, numeric, public.payment_method, text, text, text) to authenticated;

create or replace function public.apply_order_discount(
  target_order_id uuid,
  discount_amount numeric,
  reason text,
  idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  target public.orders;
  response_value jsonb;
  existing_response jsonb;
begin
  if actor_id is null or not private.has_permission('discounts.apply') then
    raise exception using errcode = '42501', message = 'Discount permission is required.';
  end if;
  if discount_amount < 0 then raise exception using errcode = '22023', message = 'Discount cannot be negative.'; end if;
  if idempotency_key is null or char_length(idempotency_key) < 8 then
    raise exception using errcode = '22023', message = 'A valid idempotency key is required.';
  end if;
  select response into existing_response from public.operation_requests
  where actor_user_id = actor_id and action = 'order.discount'
    and operation_requests.idempotency_key = apply_order_discount.idempotency_key;
  if found then return existing_response; end if;
  if nullif(trim(reason), '') is null then raise exception using errcode = '22023', message = 'A discount reason is required.'; end if;
  select * into target from public.orders where id = target_order_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'Order not found.'; end if;
  if target.status not in ('pending_confirmation', 'confirmed') then
    raise exception using errcode = '22023', message = 'Discounts can only be changed before preparation starts.';
  end if;
  if discount_amount > target.subtotal - target.voucher_discount then
    raise exception using errcode = '22023', message = 'Discount exceeds the order subtotal.';
  end if;
  update public.orders set
    discount_total = discount_amount,
    total = greatest(0, subtotal - discount_amount - voucher_discount + tax_total)
  where id = target.id returning * into target;
  insert into public.audit_logs (actor_user_id, action, entity_type, entity_id, new_values, metadata)
  values (actor_id, 'order.discount.apply', 'order', target.id::text,
    jsonb_build_object('discountTotal', discount_amount), jsonb_build_object('reason', reason, 'idempotencyKey', idempotency_key));
  response_value := jsonb_build_object('orderId', target.id, 'discountTotal', target.discount_total, 'total', target.total);
  insert into public.operation_requests (actor_user_id, action, idempotency_key, response)
  values (actor_id, 'order.discount', idempotency_key, response_value);
  return response_value;
end;
$$;

revoke all on function public.apply_order_discount(uuid, numeric, text, text) from public, anon;
grant execute on function public.apply_order_discount(uuid, numeric, text, text) to authenticated;

create or replace function public.redeem_order_voucher(
  target_order_id uuid,
  voucher_code text,
  idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  target public.orders;
  voucher public.vouchers;
  discount_value numeric(12,2);
  free_item_total numeric(12,2);
  redemption public.voucher_redemptions;
begin
  if actor_id is null or not private.has_permission('vouchers.redeem') then
    raise exception using errcode = '42501', message = 'Voucher redemption permission is required.';
  end if;
  select * into target from public.orders where id = target_order_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'Order not found.'; end if;
  select * into voucher from public.vouchers
  where vouchers.voucher_code = upper(trim(redeem_order_voucher.voucher_code))
  for update;
  if not found then raise exception using errcode = 'P0002', message = 'Voucher not found.'; end if;
  if voucher.customer_id is distinct from target.customer_id then
    raise exception using errcode = '42501', message = 'Voucher belongs to another customer.';
  end if;
  if voucher.status not in ('active', 'reserved') then
    raise exception using errcode = '22023', message = 'Voucher is not active.';
  end if;
  if voucher.expires_at is not null and voucher.expires_at <= now() then
    update public.vouchers set status = 'expired' where id = voucher.id;
    raise exception using errcode = '22023', message = 'Voucher has expired.';
  end if;
  if exists (select 1 from public.voucher_redemptions where voucher_id = voucher.id) then
    raise exception using errcode = '23505', message = 'Voucher has already been redeemed.';
  end if;

  if voucher.voucher_type = 'fixed' then
    discount_value := least(voucher.fixed_value, target.subtotal - target.discount_total);
  elsif voucher.voucher_type = 'percentage' then
    discount_value := round((target.subtotal - target.discount_total) * voucher.percentage_value / 100, 2);
  else
    select max(total_price) into free_item_total from public.order_items
    where order_id = target.id and menu_item_id = voucher.free_item_id;
    if free_item_total is null then
      raise exception using errcode = '22023', message = 'The voucher item is not present in this order.';
    end if;
    discount_value := least(free_item_total, target.subtotal - target.discount_total);
  end if;

  update public.orders set
    requested_voucher_id = voucher.id,
    voucher_discount = discount_value,
    total = greatest(0, subtotal - discount_total - discount_value + tax_total)
  where id = target.id returning * into target;
  update public.vouchers set
    status = 'redeemed', redeemed_at = now(), redeemed_order_id = target.id
  where id = voucher.id;
  insert into public.voucher_redemptions (
    voucher_id, customer_id, order_id, redeemed_by, discount_amount, idempotency_key
  ) values (
    voucher.id, target.customer_id, target.id, actor_id, discount_value, idempotency_key
  ) returning * into redemption;
  insert into public.audit_logs (actor_user_id, action, entity_type, entity_id, new_values)
  values (actor_id, 'voucher.redeem', 'voucher', voucher.id::text, to_jsonb(redemption));
  return jsonb_build_object(
    'voucherId', voucher.id, 'redemptionId', redemption.id,
    'discountAmount', discount_value, 'orderTotal', target.total
  );
end;
$$;

revoke all on function public.redeem_order_voucher(uuid, text, text) from public, anon;
grant execute on function public.redeem_order_voucher(uuid, text, text) to authenticated;

create or replace function public.issue_loyalty_voucher(
  customer_id uuid,
  free_item_id uuid,
  expires_at timestamptz,
  idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  account public.rewards_accounts;
  voucher public.vouchers;
  existing_response jsonb;
  response_value jsonb;
begin
  if actor_id is null or not private.has_permission('vouchers.issue') then
    raise exception using errcode = '42501', message = 'Voucher issue permission is required.';
  end if;
  if idempotency_key is null or char_length(idempotency_key) < 8 then
    raise exception using errcode = '22023', message = 'A valid idempotency key is required.';
  end if;
  select response into existing_response from public.operation_requests
  where actor_user_id = actor_id and action = 'voucher.issue'
    and operation_requests.idempotency_key = issue_loyalty_voucher.idempotency_key;
  if found then return existing_response; end if;
  select * into account from public.rewards_accounts
  where rewards_accounts.customer_id = issue_loyalty_voucher.customer_id for update;
  if not found or account.free_rewards_available <= 0 then
    raise exception using errcode = '22023', message = 'Customer has no free rewards available.';
  end if;
  if not exists (
    select 1 from public.menu_items mi
    where mi.id = free_item_id and mi.active and mi.loyalty_eligible
  ) then raise exception using errcode = '22023', message = 'Selected reward item is not eligible.'; end if;

  update public.rewards_accounts set free_rewards_available = free_rewards_available - 1
  where rewards_accounts.customer_id = issue_loyalty_voucher.customer_id;
  insert into public.reward_transactions (
    customer_id, transaction_type, points, eligible_purchase_change,
    free_reward_change, description, created_by, idempotency_key
  ) values (
    customer_id, 'redeem', 0, 0, -1, 'Free reward converted to voucher.',
    actor_id, 'voucher-issue:' || idempotency_key
  );
  insert into public.vouchers (
    voucher_code, customer_id, voucher_type, free_item_id, status,
    expires_at, created_by
  ) values (
    'JCV-' || upper(substr(encode(extensions.gen_random_bytes(12), 'hex'), 1, 16)),
    customer_id, 'loyalty_free_drink', free_item_id, 'active', expires_at, actor_id
  ) returning * into voucher;
  insert into public.audit_logs (actor_user_id, action, entity_type, entity_id, new_values)
  values (actor_id, 'voucher.issue', 'voucher', voucher.id::text, to_jsonb(voucher));
  response_value := jsonb_build_object('voucherId', voucher.id, 'voucherCode', voucher.voucher_code);
  insert into public.operation_requests (actor_user_id, action, idempotency_key, response)
  values (actor_id, 'voucher.issue', idempotency_key, response_value);
  return response_value;
end;
$$;

revoke all on function public.issue_loyalty_voucher(uuid, uuid, timestamptz, text) from public, anon;
grant execute on function public.issue_loyalty_voucher(uuid, uuid, timestamptz, text) to authenticated;

create or replace function public.owner_override_order_status(
  target_order_id uuid,
  requested_status public.order_status,
  reason text,
  idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  previous public.orders;
  changed public.orders;
  existing_response jsonb;
  response_value jsonb;
begin
  if actor_id is null or not private.is_owner() or not private.has_permission('owner.override') then
    raise exception using errcode = '42501', message = 'Owner override permission is required.';
  end if;
  if nullif(trim(reason), '') is null or char_length(trim(reason)) < 5 then
    raise exception using errcode = '22023', message = 'A detailed override reason is required.';
  end if;
  if idempotency_key is null or char_length(idempotency_key) < 8 then
    raise exception using errcode = '22023', message = 'A valid idempotency key is required.';
  end if;
  select response into existing_response from public.operation_requests
  where actor_user_id = actor_id and action = 'order.status.override'
    and operation_requests.idempotency_key = owner_override_order_status.idempotency_key;
  if found then return existing_response; end if;
  select * into previous from public.orders where id = target_order_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'Order not found.'; end if;
  perform set_config('app.owner_override', 'on', true);
  perform set_config('app.status_reason', trim(reason), true);
  update public.orders set
    status = requested_status,
    kitchen_visible = requested_status in ('confirmed','accepted','preparing','ready','picked_up'),
    confirmation_status = case
      when requested_status in ('confirmed','accepted','preparing','ready','picked_up','closed') then 'confirmed'
      when requested_status = 'rejected' then 'rejected'
      when requested_status = 'cancelled' then 'cancelled'
      else confirmation_status end
  where id = target_order_id returning * into changed;
  insert into public.audit_logs (actor_user_id, action, entity_type, entity_id, old_values, new_values, metadata)
  values (actor_id, 'order.status.override', 'order', changed.id::text,
    to_jsonb(previous), to_jsonb(changed),
    jsonb_build_object('reason', trim(reason), 'idempotencyKey', idempotency_key));
  response_value := jsonb_build_object('orderId', changed.id, 'status', changed.status, 'overridden', true);
  insert into public.operation_requests (actor_user_id, action, idempotency_key, response)
  values (actor_id, 'order.status.override', idempotency_key, response_value);
  return response_value;
end;
$$;

revoke all on function public.owner_override_order_status(uuid, public.order_status, text, text) from public, anon;
grant execute on function public.owner_override_order_status(uuid, public.order_status, text, text) to authenticated;

create or replace function public.customer_directory()
returns setof jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare actor_role public.app_role := private.current_role();
begin
  if actor_role not in ('owner', 'manager', 'cashier') then
    raise exception using errcode = '42501', message = 'Staff customer access is required.';
  end if;
  return query
  select jsonb_strip_nulls(jsonb_build_object(
    'id', p.id,
    'customerNumber', p.customer_number,
    'fullName', p.full_name,
    'phone', case when private.is_owner() or private.has_permission('customers.phone.view') then p.phone end,
    'email', case when private.is_owner() or private.has_permission('customers.email.view') then p.email::text end,
    'active', p.active,
    'dateOfBirth', case when private.is_owner() or private.has_permission('customers.profile.edit') then p.date_of_birth end,
    'favoriteDrink', p.favorite_drink,
    'createdAt', p.created_at
  ))
  from public.profiles p
  where p.role = 'customer'
  order by p.created_at desc;
end;
$$;

revoke all on function public.customer_directory() from public, anon;
grant execute on function public.customer_directory() to authenticated;
