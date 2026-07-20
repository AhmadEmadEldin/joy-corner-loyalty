# Joy Corner Architecture

Joy Corner is a standalone ordering, POS, and loyalty web app.

- React/webpack renders staff, customer, owner, waiter, cashier, and barista screens.
- Supabase Auth verifies staff and customer identity.
- Supabase PostgreSQL is the operational source of truth.
- PostgreSQL RLS and transactional RPCs enforce identity, roles, price validation,
  receipt totals, payment state, rewards, and order transitions.
- Supabase Realtime publishes role-safe cashier and barista projections plus
  customer-owned updates.
- Google Sheets is an asynchronous reporting/export mirror. It is never in the
  customer order transaction.
- Firebase/Firestore and the legacy Google Sheets API remain an explicit rollback
  system only and are not started by normal development.

Supabase mode is the default provider. It uses one canonical browser client in
`src/supabase/client.ts`, one typed data boundary in
`src/supabase/repository.ts`, PostgreSQL RLS, transactional RPCs, and Realtime.
Customer menu, checkout, receipts, tracking, and staff queues query only this
boundary. Cashier and barista screens use separate safe projection tables.

`src/RootApp.tsx` selects the provider before either implementation is loaded,
so the Supabase bundle does not initialize Firebase. Set
`VITE_DATA_PROVIDER=legacy` only for an intentional rollback exercise.

Database triggers append reporting references to `integration_outbox`. The
server-only `sync:reporting` worker claims them in bounded batches and upserts
Google Sheets rows. Failures retry with backoff and never roll back an order.

Browser code must never receive Google service account keys, Firebase Admin keys, Neon connection strings, or Canva secrets.
It must also never receive the Supabase service-role key; only the public
publishable key may be compiled into the frontend.
