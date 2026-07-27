# Database Schema

Neon PostgreSQL is the operational source of truth. Apply migrations in filename order with `npm run migrate:neon`; the API also applies unapplied migrations at startup.

## Core entities

- `accounts`: customer and staff identity, normalized unique customer phone, role, and profile.
- `menu_categories`: database-driven categories and display order.
- `menu_items`: product details, station, loyalty flag, availability state, and external image metadata.
- `menu_item_sizes`: product variants and authoritative prices.
- `menu_modifiers` / `menu_item_modifiers`: reusable extras and product eligibility.
- `orders`: canonical lifecycle, separate payment status, place/details, totals, and idempotency key.
- `order_items` / `order_item_modifiers`: immutable product, category, variant, modifier, price, image, quantity, and total snapshots.
- `payments`: immutable payment entries with unique order/reference idempotency.
- `order_status_history`: structured transition audit.
- `menu_price_history`: previous/new price minor units and actor.
- `rewards_accounts`: current loyalty projection.
- `loyalty_ledger`: immutable points changes with unique order/reason.
- `vouchers`: voucher definition and state.
- `voucher_redemptions`: atomic single-use redemption record.
- `notifications`: customer updates.
- `audit_logs`: privileged action audit.
- `end_day_reports`: protected business-day closures.
- `reporting_outbox`: retryable reporting delivery.

## Migration 005

Before applying:

1. Take a Neon branch or snapshot.
2. Stop catalog/status writes or deploy during a controlled window.
3. Confirm there are no custom consumers that depend on legacy status strings.

Migration effects:

- `pending_confirmation → awaiting_confirmation`
- `accepted` and `preparing → in_preparation`
- `closed → picked_up`
- adds availability states, external image fields, place details, fees, histories, immutable ledgers, voucher redemption uniqueness, payment idempotency, and active-order indexes.

Migration rollback is data-aware, not a simple down migration. Restore the Neon snapshot for a full rollback. If application rollback without database rollback is required, the old API will not understand canonical statuses and must not be redeployed unchanged.

## Money

Existing persisted money columns remain `numeric(12,2)` for compatibility. Trusted API calculations convert to safe integer minor units, round once, and convert back only at the database boundary.

