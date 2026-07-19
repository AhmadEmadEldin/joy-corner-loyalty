begin;
select plan(16);

select has_function(
  'public',
  'can_transition_order_status',
  array['public.order_status', 'public.order_status'],
  'transition validator exists'
);
select ok(public.can_transition_order_status('pending_confirmation', 'confirmed'), 'cashier may confirm a pending request');
select ok(public.can_transition_order_status('pending_confirmation', 'rejected'), 'cashier may reject a pending request');
select ok(public.can_transition_order_status('confirmed', 'accepted'), 'barista may accept a confirmed order');
select ok(public.can_transition_order_status('accepted', 'preparing'), 'accepted advances to preparing');
select ok(public.can_transition_order_status('preparing', 'ready'), 'preparing advances to ready');
select ok(public.can_transition_order_status('ready', 'picked_up'), 'ready advances to picked up');
select ok(public.can_transition_order_status('picked_up', 'closed'), 'picked up advances to closed');
select ok(not public.can_transition_order_status('pending_confirmation', 'preparing'), 'pending request cannot skip confirmation');
select ok(not public.can_transition_order_status('closed', 'preparing'), 'closed is terminal');
select ok(not public.can_transition_order_status('rejected', 'confirmed'), 'rejected is terminal');

select ok(
  (select relrowsecurity from pg_class where oid = 'public.profiles'::regclass),
  'profiles has RLS enabled'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.orders'::regclass),
  'orders has RLS enabled'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.payments'::regclass),
  'payments has RLS enabled'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.cashier_order_queue'::regclass),
  'cashier projection has RLS enabled'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.kitchen_order_queue'::regclass),
  'kitchen projection has RLS enabled'
);

select * from finish();
rollback;

