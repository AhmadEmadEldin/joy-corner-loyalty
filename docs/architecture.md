# Joy Corner Architecture

Joy Corner is a standalone staff POS and loyalty web app.

- React/webpack renders staff, customer order, owner, waiter, cashier, and barista screens.
- Firebase Authentication verifies staff and customer identity.
- Firestore `users/{uid}` stores staff role, active state, explicit permissions, and revoked permissions.
- Firebase Hosting rewrites `/api` to the Express/Firebase Function backend.
- The backend is the authority for role checks, price validation, receipt totals, payment state, End Day, audit logging, and integrations.
- Google Sheets remains the operational reporting layer.
- Neon PostgreSQL is implemented as the normalized historical/reporting backup when `NEON_DATABASE_URL` and `NEON_BACKUP_ENABLED=true` are configured.

Supabase mode is the migration target selected by
`VITE_DATA_PROVIDER=supabase`. It uses one canonical browser client in
`src/supabase/client.ts`, one typed data boundary in
`src/supabase/repository.ts`, PostgreSQL RLS, transactional RPCs, and Realtime.
Customer menu, checkout, receipts, tracking, and staff queues query only this
boundary. Cashier and barista screens use separate safe projection tables.

Firebase/Google Sheets remains the production fallback until project-backed
Supabase database tests and authenticated role acceptance pass. The two
providers are routed at the app entry and are not mixed within an operational
order flow.

Browser code must never receive Google service account keys, Firebase Admin keys, Neon connection strings, or Canva secrets.
It must also never receive the Supabase service-role key; only the public
publishable key may be compiled into the frontend.
