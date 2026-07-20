# Joy Corner Loyalty

Joy Corner Loyalty is a React staff web app for cafe orders, customers, unpaid balances, rewards, vouchers, and daily dashboard work.

## Current Architecture

```text
React static build
-> Supabase Auth
-> Supabase PostgreSQL protected by RLS
-> Transactional order/payment/status RPCs
-> Realtime customer, cashier, and barista updates
-> Durable reporting outbox
-> Asynchronous Google Sheets export worker
```

Supabase is the default frontend and backend provider. Google Sheets is a
reporting/export mirror and never blocks ordering. Firebase remains available
only through explicit legacy commands for rollback; normal builds do not load
or initialize it. See `docs/supabase-setup.md` before applying migrations.

Supabase mode uses Auth, PostgreSQL with RLS, Realtime-safe cashier/kitchen
projections, Storage policies, transactional RPCs, and an owner-only Edge
Function. It is part of the same React application, not a second app.

The Supabase customer experience is a responsive restaurant ordering shell with
database categories and modifiers, product customization, a persistent cart,
guided checkout, live order tracking, stored-snapshot receipts, rewards,
vouchers, notifications, profile management, and a focus-managed mobile drawer.
The staff portal provides role-specific cashier, kitchen, order-entry, customer,
and owner/manager operational views. These screens never fall back to mock data.

## Important Files

- Provider entry: `src/RootApp.tsx`
- Supabase customer/staff app: `src/supabase/`
- Supabase data boundary: `src/supabase/repository.ts`
- Database schema and authorization: `supabase/migrations/`
- Google Sheets reporting worker: `scripts/sync_supabase_reporting.ts`
- Reporting tab mappings: `server/reporting/sheetMappings.ts`
- Legacy Firebase fallback: `src/app.tsx`, `src/firebase.ts`,
  `firebase-functions.cjs`, and `server/googleSheetsBackend.ts`
- Sheet write schema: `server/sheetSchema.ts`
- Normalized menu source and price resolver: `src/menuRepository.ts`
- Shared receipt money/payment calculation: `src/receiptCalculator.ts`
- Neon reporting schema: `docs/neon-schema.sql`
- Firebase Hosting/Functions config: `firebase.json`
- Firestore rules: `firestore.rules`
- Required environment variables: `.env.example`
- Staff role sync helper: `scripts/sync_firestore_staff.ts`
- Code map and ownership notes: `docs/CODE_ORGANIZATION.md`
- Supabase client and portals: `src/supabase/`
- Customer menu, checkout, navigation, and receipt components:
  `src/supabase/CustomerMenu.tsx`, `CustomerCheckout.tsx`,
  `CustomerNavigation.tsx`, and `CustomerOrders.tsx`
- Supabase migrations and database tests: `supabase/`
- Google Sheets/XLSX importer: `scripts/migrate_to_supabase.ts`
- Supabase setup and acceptance checklist: `docs/supabase-setup.md`

## Supabase UI verification

The authenticated Supabase workflow requires the selected project migrations,
publishable key, and test accounts. Keep secrets only in ignored local env
files. Before production cutover, run:

```powershell
npm run check
npm run e2e
npm run supabase:test
```

`npm run e2e` intentionally uses a non-production placeholder endpoint
to verify lazy routing and responsive sign-in shells. It does not claim to test
authenticated database writes; follow `docs/supabase-setup.md` for that final
project-backed acceptance pass.

## Google Sheet

Use the spreadsheet named `Joy_Corner_Integrated_WITH_Loyalty_Winners`.

Set its ID as:

```text
GOOGLE_SHEET_ID=<spreadsheet id only>
```

Canonical sheet ID:

```text
1e1z1pfNArVzaZs5FE4k0e3JqIlwJIPG_aWH4Fziqnl8
```

Expected tabs:

- `Dashboard`
- `Menu`
- `Customers`
- `Orders`
- `Payments`
- `Unpaid Tracker`
- `Rewards`
- `Lists`
- `Loyalty Winners`
- `Reward Redemptions`

The backend also supports existing helper tabs used by the app, such as `Generated Vouchers`, `Staff`/`Staff Users`, and `History`/`Day History`.

The active interfaces load menu items, sizes, and modifiers from Supabase. The
database RPC re-reads availability and prices before atomically writing each
order. `src/joy_corner_menu_with_sizes.json` remains a version-controlled seed
and legacy fallback, not the live Supabase price authority.

Supabase order RPCs revalidate line totals, payment state, and idempotency keys in
one database transaction. The customer cart keeps its draft and submission key
together across refreshes, so retrying cannot create a second order.

End Day reset is owner-only and writes an immutable Day History row before marking same-day order rows as archived. If the current `YYYY-MM-DD` business date already exists in Day History, the backend rejects the reset with HTTP `409` to prevent duplicate closure. Customer rows, loyalty history, generated vouchers, payments, and unpaid balances are not deleted by the reset flow.

## Legacy Firebase rollback reference

The following Firebase details apply only when `VITE_DATA_PROVIDER=legacy` is
set intentionally. They are not required for the normal Supabase app.

Every staff member must have a Firebase Auth email/password account and a matching Firestore document:

```text
users/{firebaseAuthUid}
```

The document ID must be the exact UID from Firebase Authentication, not the email address. For example, if Firebase Auth shows owner UID `abc123`, create:

```text
users/abc123
```

Required fields:

```json
{
  "email": "owner@joycorner.com",
  "displayName": "Joy Corner Owner",
  "type": "staff",
  "role": "owner",
  "active": true,
  "grant": [],
  "revoke": []
}
```

Allowed roles are `owner`, `manager`, `cashier`, `waiter`, and `barista`.
Use Firestore field types exactly: `email`, `displayName`, `type`, and `role` are strings; `active` is a boolean; `grant` and `revoke` are arrays of lowercase permission strings.

Feature-level access uses role defaults plus grant overrides minus revoke overrides:

```json
{
  "grant": ["receipts.print"],
  "revoke": ["customers.delete"]
}
```

Owners receive all backend permissions automatically. Other staff keep their role defaults unless an owner grants a permission in `grant` or blocks one in `revoke`. Existing `permissions` and `revokedPermissions` documents are still read for compatibility, but new writes use `grant` and `revoke`.

Owner Staff Management can securely create Firebase Auth staff users from the app through Firebase Admin. The owner stays signed in while the backend creates the staff Auth account and writes `users/{uid}`.

If your Firebase Auth users already exist and your `Staff` sheet has `Email`, `Role`, `Name`, `Active`, `Grant`, and `Revoke`, run:

```powershell
npm run sync:staff
```

This updates matching Firebase Auth display names/disabled status and writes Firestore `users/{uid}` role documents. It does not read, write, or migrate plaintext passwords. If a staff email does not exist in Firebase Auth yet, create that user from Owner Staff Management or Firebase Console first.

Staff documents use this shape:

```json
{
  "email": "staff@example.com",
  "displayName": "Staff Name",
  "type": "staff",
  "role": "owner",
  "active": true,
  "grant": [],
  "revoke": [],
  "createdAt": "server timestamp",
  "updatedAt": "server timestamp"
}
```

## Customer Order Requests

Customers can open `/order`, sign up or sign in with Firebase Auth, choose a menu item, and submit an order request. Customer accounts do not need staff Firestore roles. On signup, the app creates `customers/{uid}` in Firestore, then calls the Firebase Function to create or reuse the matching row in the Google Sheet `Customers` tab. The backend verifies the customer Firebase token before touching Google Sheets.

When a customer submits an order, the backend writes the request to `Orders` as `Staff = Customer Request`, `Payment Status = Unpaid`, and `Order Status = Requested`.

Customer documents use this shape:

```json
{
  "email": "customer@example.com",
  "displayName": "Customer Name",
  "phone": "optional",
  "type": "customer",
  "active": true,
  "loyaltyPoints": 0,
  "createdAt": "server timestamp",
  "updatedAt": "server timestamp"
}
```

Staff accounts use `/` for staff access and must not use `/order`. Customer accounts use `/order` and cannot access the staff dashboard because they do not have `users/{uid}` staff role documents.

## Role Data

- `owner`: full app data and owner controls.
- `manager`: full operational data except owner-only reset controls.
- `cashier`: full operational data except owner-only controls.
- `waiter`: order-taking data, customer lookup, menu, and receipt workflow.
- `barista`: dashboard pickup board and pickup completion only.

The UI hides unavailable actions, and the backend enforces the same role permissions for every API action.

## Local Development

```powershell
npm install
npm run dev
```

This starts the Supabase application at `http://localhost:8081`. The browser
connects directly to Supabase using its publishable key; no Firebase backend is
started. Use `npm run dev:legacy` only for an intentional rollback exercise.

## Checks

```powershell
npm run lint:types
npm run lint
npm test
npm run build
```

Run the full local verification chain:

```powershell
npm run check
```

## Deployment and reporting

```powershell
npm run build
npm run sync:reporting
npm run supabase:lint
npx supabase migration list --linked
```

## Security

- Never commit `.env.local`, `.env`, or service account secrets.
- Do not call Google Sheets directly from the browser.
- The scheduled reporting worker uses server-only Supabase and Google
  credentials. Share the Sheet with that Google service account as Editor.
- Keep Canva credentials server-side only. If Canva secrets are not configured, voucher link/update workflows should fail clearly without breaking loyalty tracking.
- Rotate service account keys if they were ever pasted into public code, GitHub, old integrations, or frontend variables.

## Legacy Firebase fallback

Firebase deployment commands remain available only for rollback:

```powershell
npm run dev:legacy
npm run e2e:legacy
npm run deploy:firebase
```

## Optional Neon Reporting Database

Neon is prepared as a server-side reporting and backup target. Add these backend-only values when the database is provisioned:

```text
NEON_DATABASE_URL
NEON_BACKUP_ENABLED=true
```

Apply `docs/neon-schema.sql` only if the additional Neon backup is intentionally
enabled. Supabase remains the operational source of truth.
