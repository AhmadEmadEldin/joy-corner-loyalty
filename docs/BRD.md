# Joy Corner Loyalty BRD

## Purpose

Joy Corner Loyalty is a staff web app for cafe customer records, orders, unpaid balances, reward tracking, voucher generation/redemption, and daily dashboard operations.

## Production Architecture

```text
Laptop / VS Code
-> GitHub repository
-> Netlify deploy
-> Firebase Auth email/password
-> React Firebase ID token
-> /api Netlify redirect
-> netlify/functions/api.js
-> Firebase Admin token verification
-> Firestore users/{uid} role lookup
-> Google Sheets API
-> Role-filtered React dashboard
```

## Core Code

- Frontend: `src/app.tsx`
- Firebase client: `src/firebase.ts`
- Netlify Function: `netlify/functions/api.js`
- Backend: `server/googleSheetsBackend.ts`
- Sheet schema: `server/sheetSchema.ts`
- Netlify routing/build config: `netlify.toml`

## Authentication And Authorization

Staff sign in with Firebase Auth email/password.

The frontend sends the Firebase ID token to the backend:

```text
Authorization: Bearer <Firebase ID token>
```

The backend verifies the token, then reads:

```text
users/{firebaseAuthUid}
```

The document must include:

```json
{
  "email": "staff@example.com",
  "role": "owner",
  "active": true,
  "displayName": "Staff Name"
}
```

Allowed roles:

- `owner`
- `cashier`
- `waiter`
- `barista`

The app does not use hardcoded production staff emails. Firestore is the source of truth.

## Role Access

- `owner`: all tabs, all operational actions, owner reset controls, debug sheets.
- `cashier`: dashboard, customers, orders, rewards, vouchers, unpaid, history, menu, payments, voucher actions.
- `waiter`: order-taking workflow, customer lookup, menu, receipt history, pickup action.
- `barista`: pickup dashboard and mark-picked-up action.

The frontend filters tabs for usability. The backend enforces permissions for security.

## Google Sheets Database

Main spreadsheet:

```text
Joy_Corner_Integrated_WITH_Loyalty_Winners
```

Required environment variable:

```text
GOOGLE_SHEET_ID
```

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

The current implementation also reads/writes `Generated Vouchers` and supports aliases for existing tab names such as `Staff`/`Staff Users` and `History`/`Day History`.

## API

The frontend calls `/api`. Netlify redirects this to `/.netlify/functions/api`.

Main action endpoint:

```text
GET /api?action=appData
POST /api
```

Common actions:

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
- `debugAuth`
- `debugSheets`

## Environment Variables

Frontend Firebase variables:

```text
VITE_FIREBASE_API_KEY
VITE_FIREBASE_AUTH_DOMAIN
VITE_FIREBASE_PROJECT_ID
VITE_FIREBASE_APP_ID
VITE_FIREBASE_STORAGE_BUCKET
VITE_FIREBASE_MESSAGING_SENDER_ID
VITE_FIREBASE_MEASUREMENT_ID
```

Backend Google Sheets variables:

```text
GOOGLE_SHEET_ID
GOOGLE_CLIENT_EMAIL
GOOGLE_PRIVATE_KEY
```

Backend Firebase Admin variables:

```text
FIREBASE_PROJECT_ID
FIREBASE_CLIENT_EMAIL
FIREBASE_PRIVATE_KEY
```

## Security

- Google service account credentials stay in the backend only.
- Firebase Admin credentials stay in Netlify environment variables only.
- The browser never receives service account credentials.
- Firestore role documents control staff access.
- API role checks are required even when the UI hides actions.

## Success Criteria

1. Staff can sign in with Firebase email/password.
2. Backend verifies Firebase ID token.
3. Backend finds active Firestore `users/{uid}` profile.
4. Correct role-specific UI appears.
5. Backend reads/writes the Google Sheet.
6. Owner/cashier/waiter/barista each receive only their intended data/actions.
7. Missing env vars, inactive staff, missing staff profiles, and missing sheet tabs return clear errors.
