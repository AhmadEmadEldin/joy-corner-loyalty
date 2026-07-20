# Joy Corner Supabase static review — 2026-07-20

Scope: migrations, RLS, indexes, functions, triggers, Realtime, Storage, RPC
authorization, query paths, customer isolation, and cashier/barista projections.
The review used the installed `supabase-postgres-best-practices` skill v1.1.1.
A linked, read-only `supabase db lint` was run. No migration push, SQL mutation,
or production data write was run.

## Priority summary

### P0 — Critical security issues

No confirmed cross-customer data read or unauthenticated write path was found in
the static implementation. Customer-owned tables consistently compare their
owner column to `(select auth.uid())`, and privileged public RPCs perform an
identity plus role/permission check.

Two defense-in-depth issues had high blast radius if the `private` schema were
ever exposed or used by another database client:

- Internal `SECURITY DEFINER` helpers inherited PostgreSQL's default `EXECUTE`
  grant to `PUBLIC`, while authenticated users had schema usage. Direct access
  is now revoked for number generators, projection refreshers, reward posting,
  and trigger functions.
- Raw `payments` rows used `REPLICA IDENTITY FULL` and were published even
  though the browser never consumes payment records. This increased sensitive
  WAL payload and Realtime RLS fan-out. The local hardening migration removes
  the table from the publication and restores default replica identity.

### P1 — RLS mistakes and authorization weaknesses

- Direct column updates on `profiles` let a customer bypass the validated,
  audited `update_customer_profile` RPC. The local hardening migration revokes
  that direct update grant. Reads remain customer-isolated.
- Stable RLS helper functions (`is_owner`, `has_permission`, `current_role`)
  were invoked directly in policies, allowing per-row evaluation. The local
  migration wraps them in scalar `select` expressions so PostgreSQL can cache
  them as init plans.
- Tables use `ENABLE ROW LEVEL SECURITY`, not `FORCE ROW LEVEL SECURITY`.
  Supabase Data API roles remain protected, but an accidental table-owner
  application connection would bypass policies. Do not force RLS until all
  migration/service-role workflows have been tested locally.
- `customer_directory()` admits owner, manager, and cashier by hard-coded role.
  Field-level phone/email checks are permission-aware, but base directory
  access cannot be revoked through `user_permissions`. Prefer a dedicated
  `customers.directory.view` permission in a separately tested migration.

### P1 — Missing indexes

The local hardening migration adds indexes for unindexed foreign keys and the
observed customer/staff ordering paths. The most important additions are:

- permission reverse lookups (`role_permissions`, `user_permissions`);
- modifier, voucher, notification, status-history, payment confirmer, and
  redemption foreign keys;
- customer voucher/notification chronological reads;
- customer directory and cashier/kitchen queue ordering.

These should be reviewed with production cardinalities before approval. For a
large live database, use `CREATE INDEX CONCURRENTLY` in a non-transactional,
operator-run rollout rather than applying all indexes in one migration.

### P1 — Unsafe `SECURITY DEFINER` functions

All reviewed definer functions set `search_path = ''`, which is the correct
anti-hijacking pattern. Public RPCs validate `auth.uid()` and permissions before
mutating data. Internal helper execution grants were the main issue and are
fixed locally.

Remaining RPC concerns:

- `redeem_order_voucher` accepts an idempotency key but does not validate its
  length or return a stored response on replay. Unique constraints prevent a
  second redemption, but retries are not semantically idempotent.
- `confirm_order_payment` allows confirmed totals above the order total and
  accepts an arbitrary proof URL string. Add overpayment rules and bind proof
  paths to owned Storage objects after product requirements are confirmed.
- `customer_directory` is `SECURITY DEFINER` and returns an unpaginated full
  directory. Add cursor pagination and a dedicated permission.

### P2 — Overly broad grants

- Authenticated users receive DML grants on every menu table and SELECT grants
  on several owner-only administration tables. RLS blocks unauthorized rows,
  so this is not a demonstrated leak, but narrower grants/RPC-only writes would
  reduce the impact of a future policy mistake.
- `private` schema usage remains granted to `authenticated` because RLS policies
  call the three authorization helpers. Only those helpers retain authenticated
  execute access; internal workflow helpers are revoked.

### P1 — Slow or repeated queries

- Both order-creation RPCs query each modifier twice inside nested item loops.
  Projection triggers then rebuild aggregate JSON after the order insert, every
  item insert, and every modifier insert. This creates N+1 queries plus repeated
  full projection aggregation and can approach quadratic work for large carts.
  Refactor to validate all item/modifier IDs set-wise and refresh projections
  once at the end; this is not an automatic safe fix because it changes core
  transactional logic.
- The customer dashboard originally reloaded all historical orders, items, and
  modifiers on every relevant Realtime event. The local app now bounds the
  initial order page, fetches children only for visible order IDs, and debounces
  event-driven refreshes. Cursor pagination remains a later enhancement.
- Customer Realtime channels originally had no row filters. Local subscriptions
  are now filtered by customer ID and debounced; database RLS remains the
  security boundary.
- `loadMenu` performs five parallel set queries rather than an N+1 loop; this is
  acceptable for the current menu size.

### P1 — Missing constraints

Do not add these until existing data has been audited:

- voucher value columns are not mutually exclusive for each voucher type;
- a payment's `customer_id` can disagree with its order's customer;
- voucher redemption customer/order values can disagree with the voucher and
  order records;
- confirmed payments do not require `confirmed_by` and `confirmed_at`;
- order status, confirmation state, visibility, and lifecycle timestamps are
  only partially constrained;
- free-form notes, references, idempotency keys, and proof URLs have no maximum
  database length.

Use `NOT VALID` constraints first, repair existing rows, then validate in a
separate migration to minimize lock and rollout risk.

### P1 — Migration ordering problems

`20260719201353_security_advisor_hardening.sql` unconditionally referenced the
environment-provided `public.rls_auto_enable()` function. Fresh local projects
without that helper would fail before later migrations could run. The statement
is now guarded with `to_regprocedure`. If this version is already recorded in a
remote migration history, the edit only fixes fresh resets; it does not re-run
remotely.

The later generic voucher migration correctly follows the initial constraint
and function definitions. No timestamp inversion or missing dependency was
found among the five existing migrations.

### P1 — Realtime subscription risks

- Raw payment publication was unnecessary and is removed locally.
- `REPLICA IDENTITY FULL` remains on customer-owned orders, rewards, vouchers,
  and notifications plus redacted queue tables. Confirm delete/update payload
  behavior under RLS with two customer sessions before production approval.
- Local customer subscriptions are filtered by owner ID. Database RLS remains
  enabled on every published relation and must still be verified with two live
  customer sessions before production approval.

### P1 — Storage policy risks

- Customers can update and delete any payment-proof object under their UUID
  folder, including after a cashier has relied on it. Bind proof lifecycle to an
  order/payment state or make proofs append-only after submission.
- The staff read policy grants every user with `payments.confirm` access to the
  whole payment-proof bucket. Prefer order-bound paths and an RPC/signed-URL
  check so only operationally relevant proofs are disclosed.
- Folder ownership, MIME allowlists, and size limits are present and correctly
  isolate normal customer uploads by top-level UUID.

### P1 — Customer isolation and staff projections

- Static customer isolation is sound across profiles, orders, order items,
  payments, rewards, vouchers, redemptions, notifications, and status history.
  Database integration tests still need two real customer identities to prove
  negative reads and writes.
- The cashier projection intentionally includes totals, payment state, voucher
  ID, pickup name, and customer notes, but excludes profile history/contact
  fields.
- The barista projection excludes phone, email, payment, reward, voucher, and
  internal notes and truncates pickup name to the first token. Its shared
  `item_summary` still carries customer-entered notes verbatim. Treat that as a
  possible PII channel; create a kitchen-specific summary containing only
  preparation-safe notes after product review.

## Safe local fixes applied

- Guarded the optional `rls_auto_enable()` hardening statement.
- Added a hardening migration for internal function privileges,
  audited profile updates, RLS init-plan caching, targeted indexes, and removal
  of raw payment Realtime publication.
- Removed the unused client payment subscription.
- Expanded pgTAP assertions for the privilege, index, and publication changes.
- Bounded customer order reads, filtered Realtime subscriptions by customer,
  and debounced customer/staff projection refreshes.

## Follow-up implementation — 2026-07-21

After explicit approval to make Supabase the frontend/backend, provider
selection moved to `src/RootApp.tsx` and now defaults to `supabase`. The legacy
Firebase application is lazy-loaded only when `VITE_DATA_PROVIDER=legacy`.
Normal development no longer starts the Firebase/Sheets backend.

A later migration adds a protected, indexed reporting outbox plus
server-only claim/complete/fail functions. The Google Sheets worker batch-upserts
stable record IDs into the eight existing operational tabs, changes only mapped
columns on existing rows, and retries independently of order transactions. It
will not create tabs or rewrite formula/manual columns. No Firebase order/receipt
mirror was added. The migration seeds current operational records into the queue
for a first-run backfill, while deliberately excluding historical audit logs.
After explicit production approval, both migrations were applied to the linked
Supabase project on 2026-07-21. Migration history, anonymous API isolation, RPC
authorization, Edge Function authentication, and linked database lint were
verified after deployment. The reporting queue remains non-blocking while its
Google service-account credential is configured.

The policies were subsequently compared directly with Supabase's current RLS
guide. Regression coverage now fails if any public table/partition lacks RLS or
if an anonymous user can execute a public `SECURITY DEFINER` function. No new
authorization defect was identified by that comparison.
