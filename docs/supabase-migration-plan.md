# Supabase Operational Migration Plan

## Current architecture

Joy Corner is a React 19 and TypeScript single-page application built with
webpack. Firebase Hosting serves the app and rewrites `/api` to an Express app
inside Firebase Functions. Firebase Auth identifies staff and customers,
Firestore stores staff/customer profiles and an `activeOrders` realtime mirror,
and Google Sheets is the operational system of record. Neon PostgreSQL is an
optional audit/reporting backup only.

Reusable business modules already exist for menu normalization, permissions,
receipt totals, order status display, printing, and responsive navigation. These
modules remain in place and are adapted instead of being duplicated.

## Target architecture

```text
React + TypeScript
  -> Supabase Auth
  -> Supabase Data API protected by RLS
  -> PostgreSQL transactional functions for atomic business operations
  -> Supabase Realtime for role-scoped queues and customer updates
  -> Supabase Storage for menu images and payment proof
  -> Supabase Edge Functions for privileged orchestration and optional exports
```

Supabase PostgreSQL becomes the single operational source of truth. Firebase and
Google Sheets remain available during dual-run verification and rollback, but
new Supabase-mode orders never depend on a Sheet write.

## Existing system findings

- Roles: owner, manager, cashier, waiter, barista, plus a separate customer
  profile type. Manager is retained for backward compatibility.
- Current preparation flow: Requested -> Accepted -> Preparing -> Ready ->
  Picked Up. Customer requests currently enter the same backend too early.
- Permissions are reusable TypeScript keys with role defaults plus per-user
  grants/revocations in Firestore.
- Receipt totals and menu price validation are already authoritative on the
  server and have unit tests.
- Rewards currently use seven paid eligible drinks per free drink. The Supabase
  implementation preserves seven as seeded configuration and only grants after
  an order is paid and closed.
- Vouchers and payment collection have idempotency protections, but Sheet rows
  cannot provide PostgreSQL transaction isolation.
- `src/app.tsx` owns the provider route boundary. Supabase customer and staff
  routes are lazy-loaded from `src/supabase/`, where menu, customization,
  checkout, receipt, navigation, queues, and repository concerns are decomposed.
- No active Vercel, Netlify, or Apps Script production path exists.

## Cutover phases

1. **Foundation**: create schema, grants, RLS, storage policies, transactional
   functions, seed data, typed client, and verification tests.
2. **Identity**: enable Supabase Auth, migrate/invite staff, and use the profile
   trigger for customers. Never import Sheet passwords.
3. **Read shadowing**: import menu and historical data, compare Supabase reports
   with the production workbook, and keep Firebase/Sheets serving production.
4. **Customer pilot**: enable `VITE_DATA_PROVIDER=supabase` only in a test build;
   test signup, cart, checkout, own-data isolation, receipts, rewards, vouchers,
   storage uploads, and realtime updates.
5. **Staff pilot**: test cashier confirmation, safe barista projection, owner
   permissions, payment confirmation, rewards, audit logs, and status history.
6. **Production cutover**: freeze Sheet operational writes, run the idempotent
   final import, reconcile counts/totals, switch the frontend provider, and
   monitor Supabase advisors/logs.
7. **Fallback window**: retain the Firebase/Sheets code and export capability
   until acceptance tests and at least one full business-day close succeed.
8. **Deprecation**: remove polling and operational Sheet writes only in a later,
   separately reviewed change.

## Security model

- Frontend receives only the Supabase URL and publishable/anon key.
- The service-role key remains server-only.
- Authorization is based on `profiles`, `role_permissions`, and
  `user_permissions`; user-editable metadata is never trusted for access.
- Sensitive mutations use authenticated transactional RPC/Edge Functions with
  explicit role/permission checks, idempotency keys, and audit events.
- Baristas consume a safe kitchen projection that contains no payment or private
  customer fields.
- All exposed tables enable RLS and include explicit Data API grants because new
  Supabase projects no longer expose tables automatically.

## Data mapping

| Current source | Supabase destination |
| --- | --- |
| Staff + Firestore users | Auth users, profiles, user_permissions |
| Customers | Auth invitations (optional), profiles, rewards_accounts |
| Menu | menu_categories, menu_items, menu_item_sizes, modifiers |
| Orders | orders, order_items, order_item_modifiers, status history |
| Payments | payments |
| Unpaid Tracker | derived unpaid orders/payments (no duplicated balance) |
| Rewards / Loyalty Winners | rewards_accounts, reward_transactions |
| Generated Vouchers | vouchers |
| Reward Redemptions | voucher_redemptions |
| Audit Log | audit_logs |

## Rollback

Before production cutover, rollback is a configuration change back to
`VITE_DATA_PROVIDER=firebase`. During the fallback window, Supabase exports can
be reconciled to Sheets. No existing Firebase or Google integration is deleted
until the Supabase system passes all role, RLS, migration, and business-day
tests.
