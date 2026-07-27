# Joy Corner Repository Audit

Audit date: 2026-07-27  
Scope: complete repository, design references, frontend, API, database migrations, reporting worker, and test configuration.

## Confirmed architecture

| Area | Confirmed implementation |
|---|---|
| Frontend | React 19.2.3, React DOM 19.2.3, TypeScript 5.9.2, webpack 5 |
| Backend | Express 4.22.2 running as the Northflank API entry in `server/api.ts` |
| Routing | Path-based portal selection in `src/RootApp.tsx`; `/order` is customer, all other paths are staff |
| Authentication | First-party email/password accounts, scrypt password hashes, signed HTTP-only session cookie |
| Authorization | Server-side role middleware plus UI permission filtering |
| Database | Neon PostgreSQL through `pg`; migrations are checksum-tracked and advisory-lock protected |
| Realtime | Authenticated Server-Sent Events with role-filtered topics |
| Images | Cloudinary object storage after migration 005; legacy Neon blobs remain readable during migration |
| Google Sheets | Asynchronous reporting-only export through `reporting_outbox`; no live request reads Sheets |
| State | React local state and server projections; device-local cart draft only |
| Styling | CSS with centralized Joy Corner tokens and responsive component overrides |
| Deployment | Northflank API/worker, Neon database, Vercel static frontend; Dockerfile present |
| Tests | Jest unit/component tests and Playwright end-to-end configuration |

There is no Firebase, Firestore, Firebase Auth, Firebase Storage, Supabase, or Canva SDK configuration in the current repository.

## Workflow trace

- Customer signup normalizes phone, blocks staff-domain self-registration, hashes the password, creates a rewards account, and starts an HTTP-only session.
- Staff login uses the same protected session endpoint and rejects customer-role accounts in the staff portal.
- Menu loading reads normalized Neon category, item, size, and modifier tables.
- Customer and staff order creation reload current product availability and prices inside a transaction, calculates totals in integer minor units, snapshots item data, atomically redeems a voucher, and records initial status history.
- Cashier confirmation validates the central transition model, role, current item availability, and current price before committing.
- Payments are role protected, row locked, idempotent, bounded by the remaining balance, and derive payment status on the server.
- Barista transitions are `confirmed → in_preparation → ready → picked_up`.
- Picked-up orders leave active queues, remain in history, notify the customer, and award loyalty once when fully paid.
- Receipts use immutable order-item price snapshots.
- End of Day uses Cairo dates, an advisory transaction lock, active-order protection, durable reports, audit logs, and reporting outbox delivery.

## Confirmed findings and repairs

### P0 repaired

- Two conflicting operational state machines existed. `src/orderWorkflow.ts` is now the single transition and payment model; the unused legacy transition module was removed.
- Old `accepted`, `preparing`, and `closed` statuses did not match the required workflow. Migration 005 converts them without deleting history.
- Payment idempotency was missing. Each payment now requires a unique idempotency key.
- Status history was only embedded in the generic audit log. A structured `order_status_history` table now records actor, role, previous state, next state, note, and timestamp.
- Price calculations used floating-point arithmetic. New order and payment calculations now convert through integer minor units.
- Price edits had no history or realtime event. Price changes now lock the size row, store old/new minor values, audit the actor, and publish `menu`.
- Voucher status changed atomically, but there was no immutable unique redemption record. `voucher_redemptions.voucher_id` is now unique.
- Rewards relied only on a mutable balance and boolean. `loyalty_ledger` adds a unique order/reason entry.
- Active queue filters included obsolete lifecycle values. Queries now explicitly include only active canonical states.
- Egyptian local mobile numbers such as `012…` normalized incorrectly. They now normalize to `+2012…`.

### P1 repaired

- Product unavailable items were hidden by `/api/menu`. They now remain visible unless archived and carry a typed availability state.
- The backend rejects unavailable or stale-price products at order creation and cashier confirmation.
- Customer carts reconcile against live menu SSE updates, invalidate unavailable lines, update changed prices, and block checkout pending acknowledgement.
- Structured place fields now cover dine-in, takeaway, car, outside, and delivery.
- Customer phone lookup now returns points, vouchers, unpaid balance, and order count.
- Completed, rejected, and cancelled orders have a dedicated staff history endpoint.
- Customer directory rows now use database-derived orders, spend, unpaid balance, points, and vouchers.
- Owner catalog management now supports product creation, category, display order, availability state, archival/restoration, images, loyalty, preparation station, and auditable price edits.

### P2 repaired

- Staff navigation was a light horizontal tab strip. It is now a grouped dark sidebar, tablet/mobile drawer, top utility bar, and real authenticated user card.
- Authentication screens were light. They now use coffee photography, black overlay, glass panel, serif heading, and gold actions.
- The logo was used as a full product placeholder. Product surfaces now use a coffee-photo fallback.
- Central design tokens and component styling were split into `src/styles/joy-corner-tokens.css` and `src/styles/joy-corner-components.css`.
- Product uploads are compressed to WebP client-side, size validated, and stored in Cloudinary rather than new database blobs.

## Remaining confirmed gaps

- `NEON_DATABASE_URL` is empty in the local environment. Protected real-data browser flows and database migration execution could not be run locally.
- Cloudinary credentials are not configured locally, so a live upload was not performed.
- Google Sheets credentials are not configured locally, so worker delivery was not exercised.
- Forgot-password email delivery is not implemented because no transactional email provider is configured.
- Voucher creation/cancellation and manual reward adjustment APIs are not yet exposed in the owner UI; current owner pages are reporting/protection views.
- A receipt verification QR endpoint and QR image are not implemented.
- Product crop controls and modifier-link editing are not yet exposed, although upload compression, replace, remove, preview, error state, and missing-image filtering are present.
- Branches, configurable taxes/service fees, staff/role administration, and notification settings require database-backed settings tables.
- Full authenticated screenshots with real operational records remain blocked by the missing Neon connection.

## Baseline quality results

- TypeScript: pass
- ESLint: pass
- Jest: 17 suites and 70 tests passed
- Production webpack build: pass, with bundle-size warnings
- Browser QA: authentication and empty-state responsive shells render without overflow or framework overlays
- Expected browser console errors occurred only because the local protected API could not start without Neon.
