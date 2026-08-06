alter table orders
  add column if not exists guest_phone text;

comment on column orders.guest_phone is
  'Order-only contact phone for a walk-in customer. Does not create or identify a customer account.';

create index if not exists orders_guest_phone_created_idx
  on orders(guest_phone, created_at desc)
  where guest_phone is not null;
