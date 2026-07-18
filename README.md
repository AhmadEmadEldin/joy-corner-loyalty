# Joy Corner Loyalty

Joy Corner Loyalty is a React staff web app for cafe orders, customers, unpaid balances, rewards, vouchers, and daily dashboard work.

## Final Architecture

```text
Laptop / VS Code
-> GitHub
-> Firebase Hosting deploy
-> Firebase Auth email/password login
-> React gets Firebase ID token
-> React calls /api
-> Firebase Hosting rewrites /api to the api HTTPS Function
-> Backend verifies Firebase ID token
-> Backend reads Firestore users/{uid}
-> Backend enforces role permissions
-> Backend reads/writes Google Sheets
-> Backend generates internal Joy Corner voucher codes and redemption records
-> React renders the role-specific dashboard
```

## Important Files

- React app: `src/app.tsx`
- Firebase browser auth and staff profile read: `src/firebase.ts`
- Firebase Function entry: `firebase-functions.cjs`
- Backend auth, role checks, and Google Sheets access: `server/googleSheetsBackend.ts`
- Sheet write schema: `server/sheetSchema.ts`
- Normalized menu source and price resolver: `src/menuRepository.ts`
- Shared receipt money/payment calculation: `src/receiptCalculator.ts`
- Neon reporting schema: `docs/neon-schema.sql`
- Firebase Hosting/Functions config: `firebase.json`
- Firestore rules: `firestore.rules`
- Required environment variables: `.env.example`
- Staff role sync helper: `scripts/sync_firestore_staff.ts`
- Code map and ownership notes: `docs/CODE_ORGANIZATION.md`

## Google Sheet

Production currently remains the legacy spreadsheet named
`Joy_Corner_Integrated_WITH_Loyalty_Winners`. Do not change the configured
spreadsheet ID until the owner completes `docs/PRODUCTION_SWITCH_CHECKLIST.md`.

Set its ID as:

```text
GOOGLE_SHEET_ID=<spreadsheet id only>
```

Canonical sheet ID:

```text
1e1z1pfNArVzaZs5FE4k0e3JqIlwJIPG_aWH4Fziqnl8
```

The rebuilt working copy uses exactly these tabs, in order: `Dashboard`,
`Settings`, `Staff`, `Menu`, `Customers`, `Orders`, `Order Items`, `Payments`,
`Loyalty`, and `System Log`. Its verified migration and rollback details are in
`docs/DATA_RECONCILIATION.md`, `docs/MIGRATION_EXCEPTIONS.md`, and
`docs/ROLLBACK_PLAN.md`.

The live `Menu` tab is the menu and price source of truth. Multi-price text is parsed into selectable sizes, the browser never controls the trusted unit price, and the backend validates the active item, size, and price before writing an order. The bundled JSON is only a naming fallback for matching size labels.

Receipt line totals and paid amounts are recalculated with `src/receiptCalculator.ts` on both the frontend and backend. The waiter UI blocks concurrent submissions, sends an idempotency key with each receipt, and the backend returns the existing receipt when the same idempotency key is seen again.

End Day reset is owner-only and writes immutable typed events to `System Log`
before marking same-day order rows as archived. Repeating a completed Cairo
business date returns the existing archive metadata without creating another
closure; concurrent attempts receive HTTP `409`. Customer rows, loyalty
history, vouchers, payments, and unpaid balances are not deleted.

Offline-safe operational actions are stored in IndexedDB with device IDs and
client request IDs. They synchronize only after Firebase identity is rechecked;
conflicts and exhausted retries are visible in the owner Device Sync Center.
See `docs/OFFLINE_SYNC.md`.

## Firestore Staff Profiles

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
- `barista`: approved preparation queue, preparation progress, ready, and pickup controls only.

The UI hides unavailable actions, and the backend enforces the same role permissions for every API action.

## Local Development

```powershell
npm install
npm run dev
```

This starts:

- Frontend: `http://localhost:8081`
- Backend: `http://localhost:3001`

Local development still uses real Firebase Auth, Firestore staff roles, and Google Sheets credentials from `.env.local`. Keep the project root free of `.env` before deploying Firebase Functions because Firebase CLI treats root `.env` as Functions runtime env.

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

## Firebase Deploy Commands

```powershell
npm run deploy
npm run deploy:firebase
npm run deploy:firebase:hosting
npm run deploy:firebase:functions
npm run deploy:firebase:rules
```

## Security

- Never commit `.env.local`, `.env`, or service account secrets.
- Do not call Google Sheets directly from the browser.
- Production Google Sheets access uses the Firebase Functions runtime service account. Share the Sheet with that service account as Editor.
- Joy Corner vouchers are generated internally; no external design API or OAuth account is required.
- Rotate service account keys if they were ever pasted into public code, GitHub, old integrations, or frontend variables.

## Firebase Function Secrets

Set backend-only values with Firebase secrets:

```powershell
firebase functions:secrets:set GOOGLE_SHEET_ID
```

For `joycornerapp-c784d`, share the Google Sheet with this runtime service account:

```text
606859361107-compute@developer.gserviceaccount.com
```

Voucher generation and redemption require no third-party design credentials.

## Optional Neon Reporting Database

Neon is prepared as a server-side reporting and backup target. Add these backend-only values when the database is provisioned:

```text
NEON_DATABASE_URL
NEON_BACKUP_ENABLED=true
```

Apply `docs/neon-schema.sql` to the Neon database before enabling backup writes. The current production source of truth remains Firebase Functions + Google Sheets until a live Neon connection and reconciliation job are configured.
