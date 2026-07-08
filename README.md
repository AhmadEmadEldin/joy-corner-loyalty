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
-> Optional Canva voucher metadata stays backend-controlled
-> React renders the role-specific dashboard
```

## Important Files

- React app: `src/app.tsx`
- Firebase browser auth and staff profile read: `src/firebase.ts`
- Firebase Function entry: `firebase-functions.cjs`
- Backend auth, role checks, and Google Sheets access: `server/googleSheetsBackend.ts`
- Sheet write schema: `server/sheetSchema.ts`
- Normalized menu source and price resolver: `src/menuRepository.ts`
- Neon reporting schema: `docs/neon-schema.sql`
- Firebase Hosting/Functions config: `firebase.json`
- Firestore rules: `firestore.rules`
- Required environment variables: `.env.example`
- Staff role sync helper: `scripts/sync_firestore_staff.ts`
- Code map and ownership notes: `docs/CODE_ORGANIZATION.md`

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

The staff and customer ordering interfaces use `src/joy_corner_menu_with_sizes.json` through `src/menuRepository.ts` as the menu price source of truth. Waiters select a menu item and size; visible unit-price editing is disabled, and the backend resolves the submitted item/size price again before writing the order.

## Firestore Staff Users

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
  "active": true
}
```

Allowed roles are `owner`, `manager`, `cashier`, `waiter`, and `barista`.
Use Firestore field types exactly: `email`, `displayName`, `type`, and `role` are strings; `active` is a boolean set to `true`.

Optional feature-level permission fields:

```json
{
  "permissions": ["payments.create", "unpaid.update"],
  "revokedPermissions": ["customers.delete"]
}
```

Owners receive all backend permissions automatically. Other staff keep their role defaults unless an owner grants a permission in `permissions` or blocks one in `revokedPermissions`.

If your `Staff` sheet has `Email`, `Password`, `Role`, `Name`, and `Active`, run:

```powershell
npm run sync:staff
```

This creates or updates Firebase Auth users and writes Firestore `users/{uid}` role documents.

Staff documents use this shape:

```json
{
  "email": "staff@example.com",
  "displayName": "Staff Name",
  "type": "staff",
  "role": "owner",
  "active": true,
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
- Keep Canva credentials server-side only. If Canva secrets are not configured, voucher link/update workflows should fail clearly without breaking loyalty tracking.
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

Optional Canva secrets, only when backend voucher generation is connected:

```powershell
firebase functions:secrets:set CANVA_CLIENT_ID
firebase functions:secrets:set CANVA_CLIENT_SECRET
firebase functions:secrets:set CANVA_REFRESH_TOKEN
```

## Optional Neon Reporting Database

Neon is prepared as a server-side reporting and backup target. Add these backend-only values when the database is provisioned:

```text
NEON_DATABASE_URL
NEON_BACKUP_ENABLED=true
```

Apply `docs/neon-schema.sql` to the Neon database before enabling backup writes. The current production source of truth remains Firebase Functions + Google Sheets until a live Neon connection and reconciliation job are configured.
