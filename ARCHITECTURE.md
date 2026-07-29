# Architecture

## Runtime topology

```text
React/webpack frontend (Vercel)
  ├─ HTTP-only session requests ──> Express API (Northflank)
  ├─ menu/customer/staff queries ─> Express API
  └─ authenticated SSE stream ────> Express API
                                      ├─ Neon PostgreSQL (source of truth)
                                      ├─ Cloudinary (product images)
                                      └─ reporting_outbox
                                            └─ scheduled worker
                                                  └─ Google Sheets reporting
```

Google Sheets is never part of an operational request. Cloudinary contains product image bytes; Neon contains only image URLs and provider identifiers after migration.

Staging menu JSON is parsed and diffed by `server/menuImport.ts`. The
Owner-only preview endpoint is disabled in production, performs no writes, and
classifies additions, updates, unchanged products, archives, and field-level
changes. Confirmed application remains gated until stable source UUIDs and an
isolated staging database are available.

## Frontend boundaries

- `src/RootApp.tsx`: portal boundary.
- `src/portal/CustomerPortal.tsx`: authenticated customer orchestration.
- `src/portal/StaffPortal.tsx`: role-aware staff orchestration.
- `src/components/StaffAppShell.tsx`: responsive staff navigation and layout.
- `src/portal/CustomerMenu.tsx`: reusable database-driven menu/category/product/cart view.
- `src/portal/ProductCustomizer.tsx`: size, modifier, quantity, and note selection.
- `src/portal/OwnerMenuManager.tsx`: owner catalog and image management.
- `server/menuImport.ts`: secret-safe menu JSON normalization, validation, and
  database diff preview.
- `src/orderWorkflow.ts`: canonical order/payment constants, normalization, transitions, role checks, labels, progress, and minor-unit helpers.
- `src/styles/*`: centralized brand tokens and reusable application styling.

## API security boundary

The client never authorizes itself. `authenticate` validates the signed cookie and reloads the active account from Neon. `requireRoles` protects each staff/customer endpoint. Price, availability, voucher, payment, loyalty, state, and End-of-Day decisions are made inside server transactions.

The local-storage user object is presentation state only. Every privileged request depends on the HTTP-only cookie and current database role.

## Data consistency

- Schema changes are ordered SQL files in `server/migrations`.
- Applied migration checksums are immutable.
- Schema migration and End-of-Day execution use PostgreSQL advisory locks.
- Order, voucher, price-history, payment, loyalty, and status-history writes are transactional.
- Historical order rows contain product/category/variant/modifier/unit-price snapshots.
- Realtime messages contain only topic and entity identifiers; clients reload authorized projections.

## Deployment constraints

The in-process SSE fan-out requires one API instance unless replaced by a shared event broker. Neon remains durable if the API restarts. Reporting delivery is retryable through `reporting_outbox`.

