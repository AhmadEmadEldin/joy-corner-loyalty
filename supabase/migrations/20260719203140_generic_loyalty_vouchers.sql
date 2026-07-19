-- Legacy vouchers whose reward is simply "Drink" apply to the highest-priced
-- loyalty-eligible line in the order. Item-specific vouchers remain restricted
-- to their selected menu item.
alter table public.vouchers
  drop constraint if exists vouchers_value_shape;

alter table public.vouchers
  add constraint vouchers_value_shape check (
    (voucher_type = 'fixed' and fixed_value is not null)
    or (voucher_type = 'percentage' and percentage_value is not null)
    or (voucher_type = 'free_item' and free_item_id is not null)
    or (voucher_type = 'loyalty_free_drink')
  );

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
  elsif voucher.free_item_id is not null then
    select max(total_price) into free_item_total from public.order_items
    where order_id = target.id and menu_item_id = voucher.free_item_id;
    if free_item_total is null then
      raise exception using errcode = '22023', message = 'The voucher item is not present in this order.';
    end if;
    discount_value := least(free_item_total, target.subtotal - target.discount_total);
  else
    select max(oi.total_price) into free_item_total
    from public.order_items oi
    join public.menu_items mi on mi.id = oi.menu_item_id
    where oi.order_id = target.id and oi.loyalty_eligible and mi.loyalty_eligible;
    if free_item_total is null then
      raise exception using errcode = '22023', message = 'No loyalty-eligible drink is present in this order.';
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
