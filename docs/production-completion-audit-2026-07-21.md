# Joy Corner production completion audit

Date: 2026-07-21  
Scope: Supabase ordering application, staff operations, reporting, deployment, and retained Firebase rollback path.

## Executive result

The deployed application is a React/TypeScript single-page application built with Webpack. Supabase is the active operational backend for `/order` and the staff workspace. PostgreSQL functions are the write boundary for orders, payments, discounts, vouchers, and status transitions. Firebase remains an explicit legacy rollback build and is not in the normal Supabase request path. Google Sheets is designed as an asynchronous reporting destination through a durable Supabase outbox.

The existing customer-to-cashier-to-barista gate is sound: customer orders start pending cashier confirmation, kitchen visibility is false until cashier confirmation, and the kitchen reads a redacted projection. RLS is enabled on all public operational tables. The linked Supabase database lint reports no schema errors.

The application is not yet feature-complete against the supplied product brief. The largest gaps are catalog content, owner tools, grouped customization, cashier editing, complete operational analytics, and an externally authenticated Google Sheets worker.

## Architecture and active services

- Frontend: React 19, TypeScript 5.9, Webpack 5, CSS in `src/app.css`.
- Routes: `/order` loads the Supabase customer portal; the default staff route loads the Supabase staff portal. The legacy provider is selected only with `VITE_DATA_PROVIDER=legacy`.
- Authentication: Supabase Auth. Customer accounts self-register; staff roles come from protected Auth `app_metadata` and are synchronized into `profiles`.
- Database: Supabase PostgreSQL with seven ordered migrations, RLS, RPCs, triggers, cashier and kitchen projection tables, Realtime, and Storage.
- Reporting: `integration_outbox` plus `scripts/sync_supabase_reporting.ts`; Google Sheets writes are asynchronous and idempotent.
- Firebase: retained as an explicit backup/rollback implementation. It is not the primary frontend or operational database.
- Deployment: Netlify production at `https://joycornerapp.netlify.app`; Supabase project `ruurfhrjqfcydxbzpuqi`.

## Prioritized findings

### P0 — critical security issues

No currently exploitable P0 issue was confirmed by static review or linked database lint.

Previously risky direct profile updates, callable internal `SECURITY DEFINER` helpers, repeated RLS helper evaluation, missing foreign-key indexes, and unnecessary payment Realtime publication were already corrected by `20260720210000_local_security_and_index_hardening.sql`. That migration is present in local and remote migration history.

### P1 — release-blocking product and data issues

1. **The production catalog has no product photography.** The public API currently exposes 13 categories, 166 available items, and 227 sizes; all 166 items have no `image_url`, while 155 have no description. The fallback brand mark works technically but does not satisfy realistic product presentation.
2. **No live customization choices exist.** `menu_modifiers` and `menu_item_modifiers` both return zero rows. The schema also models modifiers as a flat checkbox list, so it cannot enforce grouped choices such as milk, sugar, ice, or single-select rules.
3. **Owner menu and image management is absent from the staff UI.** RLS and the `menu-images` bucket already support owner-only management, but there is no owner interface for item/category/size CRUD, upload, approval, crop/focal position, missing-image review, or availability changes.
4. **Cashier review is incomplete.** Cashiers can confirm/reject, collect payment, and close picked-up orders, but cannot safely edit order items, sizes, quantities, discounts, or item notes before confirmation. A transactional server-side edit RPC is required; direct table edits should not be added.
5. **The requested canonical status names differ from the database enum.** The UI labels are correct, but internal values are `pending_confirmation`, `accepted`, and `closed` rather than `pending_cashier_confirmation`, `accepted_by_barista`, and `completed`. Renaming enum values affects functions, triggers, projections, tests, reporting mappings, and existing integrations and must be a separately verified migration.
6. **Google Sheets is queued but not draining automatically.** The outbox, retry/backoff, batching, schema validation, and idempotent upsert code exist. A valid Google service-account credential and a scheduled worker runtime are not available in the repository, so live sheet synchronization cannot be truthfully verified.

### P2 — important workflow and usability gaps

1. Customer checkout is pickup-only; dine-in/table/order-location data and a language switch are absent.
2. Guest checkout is absent. Existing authenticated customer access is preserved, but this does not meet the optional access paths in the brief.
3. Barista tickets support status progression but not internal preparation notes, temporary item-unavailable reporting, or a dedicated completed history view.
4. Owner/manager overview contains queue counts rather than professional sales, payment, product, customer, and staff-performance analytics.
5. Customer order history is capped at 100 rows and loads order items and modifiers in follow-up requests. This is bounded and safe, but needs pagination for long-lived accounts.
6. Each staff queue event invokes a full `refresh()`, which reloads both queue projections and, for cashier/manager/owner roles, the complete customer directory. This is repeated work and unnecessarily re-reads customer contact data.
7. Staff Realtime listens to every event on both queue projections. RLS limits visibility, but role-specific subscription and refresh logic should subscribe only to the relevant projection and avoid unrelated reloads.
8. Realtime uses Postgres Changes. It is suitable for the present scale, but Supabase now recommends private Broadcast channels for better scalability and security when traffic grows.

## Requested database review

### RLS mistakes

- No cross-customer read policy was found. Orders, order items, modifiers, payments, rewards, vouchers, notifications, and status history are scoped to `auth.uid()` for customers.
- Cashier and kitchen users read redacted projection tables, not unrestricted order/customer tables.
- Owner policies use cached `(select private.*)` authorization checks after the hardening migration.
- Customer profile writes go through `update_customer_profile`; direct authenticated column updates were revoked.
- Remaining concern: broad authenticated table privileges rely on RLS as the final boundary. This is valid Supabase architecture, but privileges should remain limited to columns and verbs actually used.

### Missing indexes

- No high-confidence missing index remains in the reviewed query paths. Customer history, queues, notifications, voucher history, payment history, authorization joins, projection ordering, and all reviewed foreign keys are indexed by the initial and hardening migrations.
- Production query plans and `pg_stat_statements` should be reviewed after representative traffic exists; static inspection cannot prove workload-specific index value.

### Unsafe `SECURITY DEFINER` functions

- All reviewed definer functions use an empty fixed `search_path` and schema-qualified objects.
- Public RPCs validate the authenticated actor and role/permission before privileged changes.
- Internal number generators, trigger functions, projection refresh helpers, reward calculation, profile-role synchronization, and reporting trigger execution are revoked from browser roles by the hardening migrations.
- No open unsafe definer function was confirmed.

### Overly broad grants

- `authenticated` has SELECT on several tables whose rows are subsequently restricted by RLS. This is necessary for the Data API paths in use, but the grant list is broader than some role-specific UIs.
- Menu mutation grants are given to `authenticated`, with owner/menu permission enforced by RLS. Do not bypass RLS with service-role browser code.
- Reporting outbox table and claim/complete/fail RPCs are restricted to `service_role`; anonymous calls were verified to fail.

### Slow or repeated queries

- `loadMenu()` uses five parallel requests, then performs repeated array filtering per item/link in JavaScript. With 166 items this is acceptable but avoidable; maps/grouping or a customer-safe database view/RPC would reduce CPU and request count.
- Staff queue updates reload the customer directory as well as both queues. Separate queue refresh from profile/directory refresh.
- Customer dashboard loads four resources in parallel followed by two dependent requests. Keep the current bounds, add pagination, and consider one customer-safe RPC only after measuring.

### Missing constraints

- Order totals, quantities, idempotency keys, status/payment enums, outbox values, and most identifiers have useful constraints.
- Modifier grouping, minimum/maximum selections, image approval/focal metadata, service type, and table/location fields do not exist and therefore cannot be validated at the database boundary.
- Cashier order edits need explicit constraints and server-side total recalculation rather than trusting client totals.

### Migration ordering problems

- All seven current migrations are timestamp ordered and local/remote history matches.
- The generic voucher migration intentionally replaces an earlier function and is ordered after the base business-functions migration.
- Any enum rename must update dependent functions in the same controlled change. It should not be mixed with unrelated owner UI or catalog-content work.

### Realtime subscription risks

- Published tables are deliberately limited; raw profiles, private notes, order items, modifiers, audit logs, and the reporting outbox are not published.
- `payments` was removed from the publication and reset to default replica identity.
- Customer subscriptions have server-side customer/user filters. Staff projection subscriptions are not row-filtered and trigger full refreshes.
- The UI reports only a coarse connected state; subscription errors/timeouts should surface as a degraded state with retry telemetry.

## Safe local implementation sequence

1. Remove repeated staff-directory refreshes from queue events and subscribe only to queues the signed-in role can use.
2. Add owner-only menu management against existing RLS and Storage policies: item metadata, availability, sizes, image upload/replace/remove, preview, and missing-image filter. Do not invent product photos.
3. Improve accessible dialog focus management, loading/error states, and responsive queue/menu behavior; extend component and Playwright tests.
4. Add owner analytics using bounded aggregate RPCs rather than downloading all operational rows.
5. Design grouped modifiers, service type/table location, cashier transactional editing, and exact enum-name migration as separate migrations with pgTAP/RLS tests.
6. Configure a scheduled reporting worker only after a Google service-account credential and an approved runtime are supplied. Store secrets outside the browser and outside Git.
7. Run TypeScript, ESLint, Jest, production build, Supabase lint, and desktop/mobile Playwright checks before any deployment.

## External blockers and production-change boundary

- Actual product images/descriptions require approved Joy Corner content or explicit owner uploads. No fantasy images will be inserted automatically.
- Google Sheets live writes require a valid service-account credential with workbook access.
- Authenticated end-to-end customer/cashier/barista production verification requires test accounts for each role or an approved isolated Supabase branch.
- No database migration, function deployment, Storage mutation, environment-secret change, or production deployment is authorized by this audit.

## Safe local fixes completed after the audit

- Staff queue reads and Realtime subscriptions are now role-specific. Cashiers no longer subscribe to the kitchen projection, baristas no longer subscribe to the cashier projection, and waiters subscribe to neither.
- Queue changes refresh only the permitted queue data. They no longer reload the customer directory or reset the staff member's selected tab on every event.
- The customer menu mapper now groups sizes and modifiers in linear passes instead of repeatedly filtering every result array for every product.
- The product customizer now locks background scrolling, traps keyboard focus, closes with Escape, restores focus to the launching control, and exposes its description and quantity changes to assistive technology.
- A new owner-only menu and image workspace uses the existing `menu.manage` RLS and `menu-images` Storage controls. It provides search, missing-image filtering, product metadata/availability/station/reward settings, size-price editing, and explicit upload/replace/remove actions. No generated or unapproved product image was added.
- Added unit coverage for role-specific queue subscriptions and dialog focus restoration.

Validation after these changes: TypeScript passed, ESLint passed, 70 Jest tests passed across 18 suites, the Supabase production build passed, the explicit `VITE_DATA_PROVIDER=legacy` rollback build passed, linked Supabase database lint returned no errors, and four desktop/mobile Playwright smoke tests passed.

## References used for current Supabase behavior

- Supabase Storage image transformations: https://supabase.com/docs/guides/storage/serving/image-transformations
- Supabase Realtime Postgres Changes and filters: https://supabase.com/docs/guides/realtime/postgres-changes
- Supabase Realtime subscription guidance: https://supabase.com/docs/guides/realtime/subscribing-to-database-changes
- Supabase scheduled Edge Functions: https://supabase.com/docs/guides/functions/schedule-functions
