# Joy Corner Loyalty BRD

## Purpose

Joy Corner Loyalty is a Firebase-hosted cafe operations app for staff dashboards, customer order requests, unpaid tracking, rewards, vouchers, and daily history.

## Production Architecture

```text
VS Code / Laptop
-> GitHub
-> Firebase Hosting
-> React frontend
-> Firebase Auth
-> Firebase ID token
-> Firebase HTTPS Function api
-> Firebase Admin token verification
-> Firestore users/{uid} or customers/{uid}
-> Google Sheets API using the Firebase Functions runtime service account
-> Role-filtered staff dashboard or customer portal
```

## Core Code

- Frontend app: `src/app.tsx`
- Firebase browser auth/profile helpers: `src/firebase.ts`
- Firebase Function entry: `firebase-functions.cjs`
- Backend API, authorization, and Google Sheets access: `server/googleSheetsBackend.ts`
- Sheet write schema: `server/sheetSchema.ts`
- Firebase Hosting/Functions/Firestore config: `firebase.json`
- Firestore security rules: `firestore.rules`

## Authentication And Profiles

Staff sign in with Firebase Auth email/password at `/`.

Staff profiles live at:

```text
users/{firebaseAuthUid}
```

Required staff document shape:

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

Customers sign up or sign in at `/order`.

Customer profiles live at:

```text
customers/{firebaseAuthUid}
```

Customer document shape:

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

Staff accounts cannot use customer-only actions, and customer accounts cannot use staff dashboard actions.

## Roles

Allowed staff roles:

- `owner`
- `manager`
- `cashier`
- `waiter`
- `barista`

Role behavior:

- `owner`: full app data, all operational actions, owner reset controls.
- `manager`: full operational data and actions except owner-only reset controls.
- `cashier`: operational data and cashier/reward/unpaid workflows.
- `waiter`: order-taking, customer lookup, menu, receipt history, pickup action.
- `barista`: pickup dashboard and mark-picked-up action.

The frontend hides unavailable views for usability. The backend enforces role permissions for security.

## Google Sheets Database

Main spreadsheet:

```text
Joy_Corner_Integrated_WITH_Loyalty_Winners
```

Production Firebase Functions only needs this secret:

```text
GOOGLE_SHEET_ID
```

Google Sheets API authentication uses the Firebase Functions runtime service account. The Sheet must be shared with that service account as Editor.

Expected business tabs:

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

Helper tabs supported by the app:

- `Generated Vouchers`
- `Staff` or `Staff Users`
- `History` or `Day History`

## API

The frontend calls `/api`. Firebase Hosting rewrites `/api/**` to the `api` HTTPS Function.

Main endpoints:

```text
GET /api?action=appData
POST /api
```

Every protected request must include:

```text
Authorization: Bearer <Firebase ID token>
```

Common actions include:

- `appData`
- `addCustomer`
- `removeCustomer`
- `addReceipt`
- `collectUnpaidPayment`
- `updateReceiptPayment`
- `markReceiptDone`
- `generateVoucher`
- `redeemVoucher`
- `resetDay`
- `customerSearch`
- `customerHistory`
- `historyDays`
- `dayHistory`
- `customerMenu`
- `registerCustomerProfile`
- `submitCustomerOrder`

## Security

- The browser never receives Google credentials or Canva credentials.
- Firebase Functions verifies Firebase ID tokens before reading or writing Google Sheets.
- Firestore `users/{uid}` controls staff role access.
- Firestore `customers/{uid}` controls customer portal access.
- Missing, inactive, or mismatched profiles are blocked.
- Google Sheet tab resolution returns clear errors for missing tabs.
- Production deployment does not use Netlify, Vercel, or Apps Script backends.

## Success Criteria

1. Staff can sign in with Firebase email/password.
2. Customer signup creates Auth and Firestore customer profile.
3. Backend verifies Firebase ID token.
4. Backend finds an active profile in Firestore.
5. Correct role-specific UI appears.
6. Backend reads/writes the Google Sheet.
7. Staff roles receive only intended data/actions.
8. Customers cannot access staff dashboards.
9. Missing profile, inactive profile, invalid token, and missing sheet tabs return clear errors.
