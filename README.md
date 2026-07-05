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
-> React renders the role-specific dashboard
```

## Important Files

- React app: `src/app.tsx`
- Firebase browser auth and staff profile read: `src/firebase.ts`
- Firebase Function entry: `firebase-functions.cjs`
- Backend auth, role checks, and Google Sheets access: `server/googleSheetsBackend.ts`
- Sheet write schema: `server/sheetSchema.ts`
- Firebase Hosting/Functions config: `firebase.json`
- Required environment variables: `.env.example`
- Staff role sync helper: `scripts/sync_firestore_staff.ts`

## Google Sheet

Use the spreadsheet named `Joy_Corner_Integrated_WITH_Loyalty_Winners`.

Set its ID as:

```text
GOOGLE_SHEET_ID=<spreadsheet id only>
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

## Firestore Staff Users

Every staff member must have a Firebase Auth email/password account and a matching Firestore document:

```text
users/{firebaseAuthUid}
```

Required fields:

```json
{
  "email": "staff@example.com",
  "role": "owner",
  "active": true,
  "displayName": "Staff Name"
}
```

Allowed roles are `owner`, `cashier`, `waiter`, and `barista`.

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
  "role": "owner",
  "active": true,
  "createdAt": "server timestamp",
  "updatedAt": "server timestamp"
}
```

## Customer Order Requests

Customers can open `/order`, sign up or sign in with Firebase Auth, choose a menu item, and submit an order request. Customer accounts do not need staff Firestore roles. The backend verifies their Firebase token and writes the request to `Orders` as `Staff = Customer Request`, `Payment Status = Unpaid`, and `Order Status = Requested`.

## Role Data

- `owner`: full app data and owner controls.
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

Local development still uses real Firebase Auth, Firestore staff roles, and Google Sheets credentials from `.env`.

## Checks

```powershell
npm run lint:types
npm test
npm run build
```

## Security

- Never commit `.env` or service account secrets.
- Do not call Google Sheets directly from the browser.
- Keep `GOOGLE_CLIENT_EMAIL` and `GOOGLE_PRIVATE_KEY` server-side only.
- Rotate service account keys if they were ever pasted into public code, GitHub, old integrations, or frontend variables.
