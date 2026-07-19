-- Local review hardening. This migration is intentionally not pushed by the
-- review workflow; production application requires explicit approval.

-- Customer profile changes go through update_customer_profile so validation
-- and audit logging cannot be bypassed with direct Data API updates.
revoke update (full_name, phone, date_of_birth, favorite_drink, last_login_at)
  on public.profiles from authenticated;

-- Trigger and internal workflow helpers are never public RPCs. PostgreSQL
-- grants EXECUTE to PUBLIC on new functions unless it is explicitly revoked.
revoke execute on function private.next_customer_number() from public, anon, authenticated;
revoke execute on function private.next_order_number() from public, anon, authenticated;
revoke execute on function private.next_payment_number() from public, anon, authenticated;
revoke execute on function private.handle_new_auth_user() from public, anon, authenticated;
revoke execute on function private.set_updated_at() from public, anon, authenticated;
revoke execute on function private.enforce_and_log_order_status() from public, anon, authenticated;
revoke execute on function private.order_item_summary(uuid) from public, anon, authenticated;
revoke execute on function private.refresh_order_projections(uuid) from public, anon, authenticated;
revoke execute on function private.sync_order_projection_trigger() from public, anon, authenticated;
revoke execute on function private.sync_order_item_projection_trigger() from public, anon, authenticated;
revoke execute on function private.sync_modifier_projection_trigger() from public, anon, authenticated;
revoke execute on function private.calculate_rewards_for_order(uuid) from public, anon, authenticated;
revoke execute on function private.sync_profile_role_from_auth() from public, anon, authenticated;

-- Cache stable authorization helpers once per statement instead of invoking
-- them once for every candidate row evaluated by RLS.
alter policy profiles_owner_all on public.profiles
  using ((select private.is_owner())) with check ((select private.is_owner()));
alter policy owner_roles on public.roles
  using ((select private.is_owner())) with check ((select private.is_owner()));
alter policy owner_permissions on public.permissions
  using ((select private.is_owner())) with check ((select private.is_owner()));
alter policy owner_role_permissions on public.role_permissions
  using ((select private.is_owner())) with check ((select private.is_owner()));
alter policy owner_user_permissions on public.user_permissions
  using ((select private.is_owner())) with check ((select private.is_owner()));
alter policy owner_settings on public.business_settings
  using ((select private.is_owner())) with check ((select private.is_owner()));
alter policy menu_categories_owner_manage on public.menu_categories
  using ((select private.has_permission('menu.manage')))
  with check ((select private.has_permission('menu.manage')));
alter policy menu_items_owner_manage on public.menu_items
  using ((select private.has_permission('menu.manage')))
  with check ((select private.has_permission('menu.manage')));
alter policy menu_sizes_owner_manage on public.menu_item_sizes
  using ((select private.has_permission('menu.manage')))
  with check ((select private.has_permission('menu.manage')));
alter policy menu_modifiers_owner_manage on public.menu_modifiers
  using ((select private.has_permission('menu.manage')))
  with check ((select private.has_permission('menu.manage')));
alter policy menu_item_modifiers_owner_manage on public.menu_item_modifiers
  using ((select private.has_permission('menu.manage')))
  with check ((select private.has_permission('menu.manage')));
alter policy orders_owner_all on public.orders
  using ((select private.is_owner())) with check ((select private.is_owner()));
alter policy order_items_owner_all on public.order_items
  using ((select private.is_owner())) with check ((select private.is_owner()));
alter policy order_item_modifiers_owner_all on public.order_item_modifiers
  using ((select private.is_owner())) with check ((select private.is_owner()));
alter policy private_notes_owner on public.order_private_notes
  using ((select private.is_owner())) with check ((select private.is_owner()));
alter policy payments_authorized_staff_read on public.payments
  using (
    (select private.has_permission('payments.confirm'))
    or (select private.is_owner())
  );
alter policy payments_owner_all on public.payments
  using ((select private.is_owner())) with check ((select private.is_owner()));
alter policy rewards_accounts_owner_all on public.rewards_accounts
  using ((select private.is_owner())) with check ((select private.is_owner()));
alter policy reward_transactions_owner_all on public.reward_transactions
  using ((select private.is_owner())) with check ((select private.is_owner()));
alter policy vouchers_owner_all on public.vouchers
  using ((select private.is_owner())) with check ((select private.is_owner()));
alter policy voucher_redemptions_owner_all on public.voucher_redemptions
  using ((select private.is_owner())) with check ((select private.is_owner()));
alter policy notifications_owner_all on public.notifications
  using ((select private.is_owner())) with check ((select private.is_owner()));
alter policy status_history_owner_all on public.order_status_history
  using ((select private.is_owner())) with check ((select private.is_owner()));
alter policy audit_owner_read on public.audit_logs
  using ((select private.is_owner()));
alter policy cashier_queue_read on public.cashier_order_queue
  using ((select private.current_role()) in ('owner', 'manager', 'cashier'));
alter policy kitchen_queue_read on public.kitchen_order_queue
  using ((select private.current_role()) in ('owner', 'manager', 'barista'));

alter policy menu_images_owner_insert on storage.objects
  with check (
    bucket_id = 'menu-images'
    and (select private.has_permission('menu.manage'))
  );
alter policy menu_images_owner_update on storage.objects
  using (
    bucket_id = 'menu-images'
    and (select private.has_permission('menu.manage'))
  )
  with check (
    bucket_id = 'menu-images'
    and (select private.has_permission('menu.manage'))
  );
alter policy menu_images_owner_delete on storage.objects
  using (
    bucket_id = 'menu-images'
    and (select private.has_permission('menu.manage'))
  );
alter policy payment_proofs_customer_read on storage.objects
  using (
    bucket_id = 'payment-proofs'
    and (
      (storage.foldername(name))[1] = (select auth.uid())::text
      or (select private.has_permission('payments.confirm'))
    )
  );
alter policy payment_proofs_customer_delete on storage.objects
  using (
    bucket_id = 'payment-proofs'
    and (
      (storage.foldername(name))[1] = (select auth.uid())::text
      or (select private.is_owner())
    )
  );

-- Index foreign-key columns used for authorization joins, deletes, and common
-- customer/staff read paths. PostgreSQL does not index referencing columns.
create index if not exists role_permissions_permission_idx
  on public.role_permissions (permission_id);
create index if not exists user_permissions_permission_idx
  on public.user_permissions (permission_id);
create index if not exists user_permissions_granted_by_idx
  on public.user_permissions (granted_by) where granted_by is not null;
create index if not exists business_settings_updated_by_idx
  on public.business_settings (updated_by) where updated_by is not null;
create index if not exists menu_item_modifiers_modifier_idx
  on public.menu_item_modifiers (modifier_id);
create index if not exists vouchers_free_item_idx
  on public.vouchers (free_item_id) where free_item_id is not null;
create index if not exists vouchers_created_by_idx
  on public.vouchers (created_by) where created_by is not null;
create index if not exists vouchers_redeemed_order_idx
  on public.vouchers (redeemed_order_id) where redeemed_order_id is not null;
create index if not exists vouchers_reward_transaction_idx
  on public.vouchers (related_reward_transaction_id)
  where related_reward_transaction_id is not null;
create index if not exists orders_requested_voucher_idx
  on public.orders (requested_voucher_id) where requested_voucher_id is not null;
create index if not exists orders_confirmed_by_idx
  on public.orders (confirmed_by) where confirmed_by is not null;
create index if not exists orders_assigned_barista_idx
  on public.orders (assigned_barista_id) where assigned_barista_id is not null;
create index if not exists order_private_notes_updated_by_idx
  on public.order_private_notes (updated_by) where updated_by is not null;
create index if not exists order_item_modifiers_modifier_idx
  on public.order_item_modifiers (modifier_id) where modifier_id is not null;
create index if not exists payments_confirmed_by_idx
  on public.payments (confirmed_by) where confirmed_by is not null;
create index if not exists reward_transactions_order_idx
  on public.reward_transactions (order_id) where order_id is not null;
create index if not exists reward_transactions_created_by_idx
  on public.reward_transactions (created_by) where created_by is not null;
create index if not exists voucher_redemptions_order_idx
  on public.voucher_redemptions (order_id);
create index if not exists voucher_redemptions_redeemed_by_idx
  on public.voucher_redemptions (redeemed_by);
create index if not exists notifications_related_order_idx
  on public.notifications (related_order_id) where related_order_id is not null;
create index if not exists order_status_history_changed_by_idx
  on public.order_status_history (changed_by) where changed_by is not null;

create index if not exists profiles_customer_created_idx
  on public.profiles (created_at desc) where role = 'customer';
create index if not exists vouchers_customer_issued_idx
  on public.vouchers (customer_id, issued_at desc);
create index if not exists notifications_user_created_idx
  on public.notifications (user_id, created_at desc);
create index if not exists cashier_queue_created_idx
  on public.cashier_order_queue (created_at);
create index if not exists kitchen_queue_order_time_idx
  on public.kitchen_order_queue (order_time);

-- The UI refreshes payment state from orders and never consumes payment-row
-- realtime payloads. Removing this table reduces sensitive WAL payloads and
-- per-subscriber RLS work without changing application behavior.
do $$
begin
  if exists (
    select 1
    from pg_catalog.pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'payments'
  ) then
    alter publication supabase_realtime drop table public.payments;
  end if;
end $$;

alter table public.payments replica identity default;
