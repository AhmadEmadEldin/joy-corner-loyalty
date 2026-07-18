# Joy Corner Production Delivery Checklist

Status values: `TODO`, `IN PROGRESS`, `DONE`, `BLOCKED WITH EXACT REASON`.

## Phase 1 - Delivery Checklist

- `DONE` Continue from current repository state and commit `9508d04`.
- `DONE` Preserve unrelated user work.
- `DONE` Create this checklist and keep it updated.
- `IN PROGRESS` Implement, test, deploy, and commit all non-blocked scope.

## Phase 2 - Normalized Domain Model

- `DONE` Define strong TypeScript types for users, roles, permissions, customers, menu categories, menu items, sizes, flavors, extras, orders, order items, order item extras, payments, unpaid accounts, reward transactions, loyalty winners, redemptions, business days, daily archives, audit logs, sync jobs, and sync failures.
- `IN PROGRESS` Add validation schemas for all major write payloads.
- `IN PROGRESS` Use stable IDs for every entity.
- `TODO` Avoid storing full nested customer, menu, staff, or receipt objects inside entity rows.
- `TODO` Keep only minimal historical snapshot fields required for financial records.

## Phase 3 - Menu JSON

- `DONE` Keep `src/joy_corner_menu_with_sizes.json` inside the repository.
- `DONE` Validate the complete menu JSON at startup/test time.
- `DONE` Generate stable IDs for categories, items, sizes, flavors, and extras.
- `DONE` Support category, item name, sizes, size prices, standard size, flavors, ingredients, extras, availability, sold-out state, active status, display order, and preparation station.
- `DONE` Prevent hardcoded menu prices in UI components for waiter ordering.
- `TODO` Use one menu repository/service for waiter, cashier, owner menu management, backend price validation, Google Sheets sync, and Neon seed/migration.
- `DONE` Add repeatable idempotent menu seeding.

## Phase 4 - Waiter Ordering System

- `IN PROGRESS` Explicit flow: select/create customer, category, item, size, quantity, notes, cart, discount, service type, payment state, save receipt.
- `TODO` Add flavor selection when applicable.
- `TODO` Add structured extras selection.
- `DONE` Prevent waiter manual price typing.
- `DONE` Resolve price from normalized menu data.
- `DONE` Backend validates price independently.
- `TODO` Store extras as structured records.
- `DONE` Validate quantity and decimal-safe totals.
- `DONE` Prevent duplicate clicks with frontend guard and backend idempotency key lookup.
- `DONE` Ensure first item does not disappear.
- `TODO` Ensure cart state is recoverable after temporary network failure.
- `IN PROGRESS` Add stable order ID separate from unique receipt number.
- `DONE` Generate unique receipt number.
- `DONE` Add all required order statuses and enforce valid transitions server-side.
- `TODO` Add print/share receipt from waiter flow.

## Phase 5 - Barista Flow

- `IN PROGRESS` Show preparation queue with receipt details, waiter, time, customer, items, size, quantity, and notes.
- `TODO` Show flavor and extras.
- `DONE` Add Accept action.
- `DONE` Add Start Preparing action.
- `DONE` Add Mark Ready action.
- `TODO` Add Return to Queue where permitted.
- `TODO` Refresh queue reliably for waiter and cashier.
- `DONE` Prevent unauthorized status transitions.

## Phase 6 - Cashier Flow

- `IN PROGRESS` Cashier can review receipt totals and mark payment state.
- `TODO` Search receipt.
- `TODO` Collect full payment through backend-validated payment records.
- `TODO` Collect partial payment through backend-validated payment records.
- `TODO` Select payment method.
- `TODO` Record unpaid balance exactly once.
- `TODO` Close receipt.
- `TODO` Print receipt.
- `TODO` Process refund only with permission.
- `TODO` See payment history.
- `TODO` Compute remaining amount as `orderTotal - totalValidPayments`.

## Phase 7 - Owner Full CRUD

- `IN PROGRESS` Owner Controls page exists and is owner-only in UI/backend action permissions.
- `DONE` Staff CRUD.
- `IN PROGRESS` Role CRUD.
- `DONE` Permission CRUD.
- `TODO` Customer CRUD with safeguards.
- `TODO` Menu category CRUD.
- `IN PROGRESS` Menu item CRUD.
- `IN PROGRESS` Menu size and price CRUD.
- `TODO` Flavor CRUD.
- `TODO` Extras CRUD.
- `TODO` Order management with financial safeguards.
- `TODO` Payment management with financial safeguards.
- `TODO` Unpaid record management.
- `TODO` Rewards, winners, and redemptions management.
- `TODO` Business settings management.
- `TODO` Daily archive management.
- `IN PROGRESS` Confirmation dialogs for destructive actions.
- `IN PROGRESS` Audit records for owner staff, permissions, menu, and End Day changes.

## Phase 8 - Staff Permissions

- `IN PROGRESS` Firebase token and Firestore staff profile authorization enforced on backend.
- `DONE` Complete required feature permission catalog.
- `DONE` Owner automatically receives all permissions.
- `DONE` Owner can create staff access.
- `DONE` Owner can activate/deactivate staff.
- `DONE` Owner can assign role.
- `DONE` Owner can grant/revoke individual permissions.
- `IN PROGRESS` Owner can view permission history.
- `IN PROGRESS` Enforce permissions on navigation, page access, component actions, API endpoints, and backend business operations.

## Phase 9 - Google Sheets Restructure

- `DONE` Existing integration uses the exact live workbook tabs documented in `LIVE_SHEET_SCHEMA.md`.
- `DONE` Add Order Items tab safely.
- `DONE` Add Audit Log tab safely.
- `DONE` Add Sync Failures tab safely.
- `IN PROGRESS` Align stable columns for Customers, Orders, Order Items, Payments, Unpaid Tracker, Rewards, Loyalty Winners, and Reward Redemptions.
- `IN PROGRESS` Use upsert where updates are expected.
- `TODO` Prevent duplicate entity rows.
- `TODO` Prevent orphaned rows.
- `DONE` Record sync failures.
- `IN PROGRESS` Create a mapping layer between domain entities and sheet rows.

## Phase 10 - Neon PostgreSQL

- `IN PROGRESS` Neon schema exists at `docs/neon-schema.sql`.
- `DONE` Improve schema with roles, role_permissions, menu_item_flavors, updated indexes, and soft-delete fields where missing.
- `DONE` Implement migrations.
- `DONE` Implement connection health check.
- `IN PROGRESS` Implement dual-write or transactional sync strategy.
- `TODO` Report Neon result, Google Sheets result, sync status, and retry status for every write.
- `DONE` Record failed sync jobs.
- `TODO` Implement reconciliation.
- `TODO` Implement retry path.
- `BLOCKED WITH EXACT REASON` Verify live Neon connection is blocked until `NEON_DATABASE_URL` is supplied in the backend environment.

## Phase 11 - End Day / Reset

- `IN PROGRESS` Manual owner End Day archives Day History and marks orders archived.
- `DONE` Duplicate closure returns HTTP `409`.
- `TODO` Use configured business closing time.
- `TODO` Automatic scheduled close.
- `TODO` Closure lock/idempotency record.
- `TODO` Archive orders, order items, payments, unpaid balances, customer activity, rewards, redemptions, winners, staff actions, summaries, Neon archive, Sheets Day History, and audit event.
- `TODO` Verify archive integrity before reset.
- `TODO` Reset only temporary daily state.
- `TODO` Add preview, progress, rollback, retry, archive browser, and safe restore tools.

## Phase 12 - Audit Logging

- `IN PROGRESS` Persistent immutable audit logs.
- `TODO` Audit login, permission change, role change, staff activation/deactivation, menu price change, menu archive, customer update, order cancellation, payment adjustment, refund, unpaid adjustment, reward adjustment, redemption, End Day, manual reset, export, and archive restore.
- `DONE` Include auditId, userId, role, action, entityType, entityId, previousValue, newValue, reason, requestId, success, timestamp, and session metadata.
- `DONE` Persist audit logs to Neon when configured and sync relevant records to Google Sheets Audit Log.

## Phase 13 - Coffeemorphism UI

- `IN PROGRESS` App has warm Joy Corner branding and cafe visual assets.
- `TODO` Centralize design tokens for colors, spacing, typography, shadows, radii, inputs, buttons, tables, cards, dialogs, badges, and status states.
- `TODO` Verify desktop, laptop, tablet, and phone responsiveness.
- `TODO` Add visible loading, success, warning, error, empty, disabled, offline, syncing, sold out, paid, unpaid, preparing, ready, served, and cancelled states.

## Phase 14 - Logo And Favicon

- `DONE` Browser title, favicon, manifest, login logo, navigation logo, and mobile icon are configured.
- `TODO` Add Joy Corner logo to receipt header.
- `TODO` Verify favicon in deployed production.

## Phase 15 - Error Handling

- `IN PROGRESS` Backend wraps API errors and avoids raw private key leakage.
- `TODO` Add centralized typed errors with request IDs.
- `TODO` Handle missing customer, invalid menu item, invalid size, missing price, duplicate receipt, duplicate payment, invalid order state, negative amount, payment mismatch, Google Sheets timeout/quota, Neon timeout/transaction, Firebase token failure, inactive staff, unauthorized action, network loss, malformed payload, and deployment misconfiguration.
- `TODO` Add exponential backoff retry for safe integration errors.
- `TODO` Ensure no destructive retry without idempotency.

## Phase 16 - Testing

- `IN PROGRESS` Unit tests cover menu price and receipt calculation.
- `TODO` API tests.
- `TODO` Integration tests.
- `TODO` Permission tests.
- `TODO` Database tests.
- `TODO` Duplicate submit tests.
- `TODO` Payment tests.
- `TODO` Unpaid persistence tests.
- `TODO` End Day tests.
- `TODO` Archive tests.
- `TODO` Google Sheets mapping tests.
- `TODO` Neon sync tests.
- `DONE` Responsive tests.
- `DONE` Browser E2E tests using Playwright or another available browser path.
- `DONE` Production build opening smoke test.

## Phase 17 - Refactor And Docs

- `IN PROGRESS` Receipt calculations centralized.
- `TODO` Remove duplicated code and dead code.
- `TODO` Split oversized components.
- `TODO` Centralize API clients, permissions, menu logic, validation, and error handling.
- `TODO` Improve folder structure, TypeScript types, naming, and comments.
- `DONE` Update README, `.env.example`, `docs/architecture.md`, `docs/database.md`, `docs/google-sheets-mapping.md`, `docs/permissions.md`, `docs/end-day.md`, `docs/deployment.md`, `docs/rollback.md`, and `docs/testing.md`.

## Phase 18 - Deployment

- `DONE` Verify production build.
- `TODO` Verify environment variables, serverless functions, authorized domains, Neon connection where credential exists, Google service account, CORS, security headers, SPA redirects, HTTPS, manifest, favicon, API health, no mock data, and no exposed secrets.
- `DONE` Deploy to active target, Firebase Hosting/Functions.
- `DONE` Open deployed URL in a real browser and run production smoke tests.
- `DONE` Firebase deployment credentials were available locally.

## Phase 19 - Git

- `DONE` Inspected git status.
- `DONE` Created safe working branch `feature/complete-production-delivery`.
- `TODO` Format, lint, typecheck, tests, E2E, production build, secret scan, diff review.
- `TODO` Final commit: `feat: complete Joy Corner production POS delivery`.
- `TODO` Push if repository access permits and no unsafe history rewrite is required.
