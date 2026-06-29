# Joy Corner Loyalty BRD

## 1. Purpose

Joy Corner Loyalty is a staff web app for running a cafe loyalty and order workflow. The app lets staff sign in, create customer receipts, track unpaid balances, manage rewards, generate and redeem vouchers, and view daily dashboard data from Google Sheets.

The app code is pushed from the laptop to GitHub, then Netlify or Vercel deploys the frontend and `/api` backend from GitHub. It uses Firebase Authentication for login, Firestore staff profiles for role access, and Google Sheets as the operational database.

## 2. Current Architecture

### Frontend

- Main UI: `src/app.tsx`
- Firebase client setup: `src/firebase.ts`
- Styles: `src/app.css`
- Static assets: `public/assets`
- Built with Webpack.
- Deployed by Netlify or Vercel from GitHub.

### API

- Vercel API entry: `api/index.js`
- Netlify API entry: `netlify/functions/api.js`
- Backend logic: `server/googleSheetsBackend.ts`
- Sheet schema helpers: `server/sheetSchema.ts`

### External Services

- Firebase Authentication: signs in staff users.
- Firestore: stores staff profiles and roles in `users/{uid}`.
- Google Sheets: stores cafe business data.
- GitHub: stores the source code and triggers Netlify or Vercel deploys.
- Netlify or Vercel: hosts the React frontend and `/api` serverless backend.

## 3. Staff Login Logic

1. Staff signs in with Firebase email/password.
2. Frontend receives the Firebase user.
3. Frontend calls `await user.getIdToken()`.
4. Frontend sends the token to `/api` using:

```text
Authorization: Bearer <Firebase ID token>
```

5. Netlify/Vercel `/api` verifies the token using Firebase Admin.
6. Backend reads Firestore document:

```text
users/{uid}
```

7. Backend checks:

- profile exists
- `active` is `true`
- `role` is valid
- role can run the requested action

8. Backend reads/writes Google Sheets and returns role-filtered dashboard data.

## 4. Firestore Staff Profile

Collection:

```text
users
```

Document ID:

```text
Firebase Auth UID
```

Required fields:

```js
{
  email: "owner@joycorner.com",
  role: "owner",
  name: "Joy Corner Owner",
  active: true
}
```

Allowed roles:

- `owner`
- `cashier`
- `waiter`
- `barista`

If no staff profile exists, the API returns:

```json
{ "success": false, "message": "No staff profile found. Contact owner." }
```

If the staff account is inactive, the API returns:

```json
{ "success": false, "message": "Staff account inactive." }
```

## 5. Role Permissions

### Owner

Full access:

- dashboard
- customers
- orders
- rewards
- vouchers
- unpaid
- history
- menu
- owner reset tools
- debug sheets

### Cashier

Operational access:

- dashboard
- customers
- orders
- rewards
- vouchers
- unpaid
- history
- menu
- collect unpaid
- generate/redeem vouchers
- remove customers
- debug sheets

### Waiter

Order-taking access:

- orders
- customer lookup
- menu
- receipt creation
- order payment history
- mark receipt picked up when allowed

### Barista

Preparation access:

- dashboard pickup board only
- mark receipt picked up

## 6. Google Sheets Data Logic

Google Sheets is the business data store. The backend reads and writes using the Google Sheets API.

Required environment variable:

```text
GOOGLE_SHEETS_SPREADSHEET_ID
```

This must be the spreadsheet ID only, not the full URL.

Current spreadsheet ID:

```text
1e1z1pfNArVzaZs5FE4k0e3JqIlwJIPG_aWH4Fziqnl8
```

Expected tabs:

- `Dashboard`
- `Menu`
- `Customers`
- `Orders`
- `Payments`
- `Generated Vouchers`
- `Rewards`
- `Loyalty Winners`
- `Reward Redemptions`
- `Lists`
- `Staff Users`
- `Day History`

If a required tab is missing, the API should return a clear error naming the missing tab.

## 7. Main Business Flows

### Add Customer

1. Cashier or owner opens Customers.
2. Staff enters name, phone, favorite drink, birthday, notes.
3. Backend generates next customer ID.
4. Backend writes row to `Customers`.
5. Dashboard reloads data.

### Create Receipt

1. Waiter or cashier opens Orders.
2. Staff searches customer by name or phone.
3. Staff selects menu items.
4. Staff enters place/service/payment details.
5. Backend creates receipt serial.
6. Backend writes item rows to `Orders`.
7. If paid or partial, backend writes payment row to `Payments`.
8. Dashboard pickup board updates.

### Barista Pickup

1. Barista sees only the pickup board.
2. Barista marks receipt as picked up.
3. Backend updates matching order rows in `Orders`.

### Unpaid Collection

1. Cashier opens Unpaid.
2. Cashier collects payment.
3. Backend writes row to `Payments`.
4. Backend marks covered unpaid orders as paid.

### Rewards

1. Backend calculates paid eligible drink quantity.
2. Every 5 paid drinks earns 1 free drink.
3. Rewards and winners are calculated from customers, orders, and vouchers.
4. Cashier or owner can generate voucher.

### Voucher Redemption

1. Staff redeems voucher.
2. Backend marks voucher as redeemed.
3. Backend writes redemption row.
4. Rewards state updates.

### End Day Reset

1. Owner enters confirmation text.
2. Backend archives current day orders.
3. Day history remains available.
4. Customer history and rewards remain intact.

## 8. API Actions

Main action endpoint:

```text
/api?action=appData
```

All protected actions require a Firebase ID token.

Common actions:

- `appData`
- `getAppData`
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

## 9. Debug Endpoints

### Health

```text
GET /api/health
```

Returns:

```json
{
  "success": true,
  "service": "Joy Corner Firebase + Google Sheets API"
}
```

### Debug Auth

```text
GET /api?action=debugAuth
Authorization: Bearer <Firebase ID token>
```

Returns safe staff auth information:

```json
{
  "success": true,
  "uid": "...",
  "email": "owner@joycorner.com",
  "profileFound": true,
  "role": "owner",
  "active": true
}
```

### Debug Sheets

```text
GET /api?action=debugSheets
Authorization: Bearer <Firebase ID token>
```

Owner or cashier only.

Returns safe sheet diagnostics:

```json
{
  "success": true,
  "spreadsheetIdPresent": true,
  "serviceAccountPresent": true,
  "spreadsheetId": "...qnl8",
  "sheetTabsFound": ["Customers", "Orders"],
  "rowsCountByTab": {
    "Customers": 10,
    "Orders": 25
  }
}
```

## 10. Environment Variables

### Server-only Netlify/Vercel Variables

Do not prefix these with `VITE_`.

```text
GOOGLE_SHEETS_SPREADSHEET_ID
FIREBASE_CLIENT_EMAIL
FIREBASE_PRIVATE_KEY
FIREBASE_OWNER_EMAILS
APP_API_BASE_URL=/api
```

For Netlify, prefer split service-account fields instead of full JSON. Use the
Firebase Admin service account email as `FIREBASE_CLIENT_EMAIL`, put its private
key in `FIREBASE_PRIVATE_KEY`, and share the Google Sheet with that same email.
This keeps Netlify environment variables under AWS Lambda compatibility size
limits.

### Frontend Firebase Variables

These are safe public Firebase web config values.

```text
VITE_FIREBASE_API_KEY
VITE_FIREBASE_AUTH_DOMAIN
VITE_FIREBASE_PROJECT_ID
VITE_FIREBASE_STORAGE_BUCKET
VITE_FIREBASE_MESSAGING_SENDER_ID
VITE_FIREBASE_APP_ID
VITE_FIREBASE_MEASUREMENT_ID
```

## 11. Security Rules

- Firebase Auth only proves identity.
- Firestore `users/{uid}` controls staff access.
- UI hides unavailable actions, but API also enforces role permissions.
- Service account JSON must never be exposed to the frontend.
- `GOOGLE_SERVICE_ACCOUNT_JSON` and `FIREBASE_SERVICE_ACCOUNT_JSON` must stay Netlify/Vercel server secrets.
- Service account JSON files should not be committed to Git.
- If service account keys were exposed, rotate them in Google Cloud/Firebase.

## 12. Current Important Notes

- Apps Script is no longer required for the Vercel version.
- Old Apps Script deployment can be disabled or deleted.
- The app should not call Google Sheets directly from the frontend.
- The frontend should call only `/api`.
- Local preview data is only an emergency fallback.

## 13. Success Criteria

The app is considered working when:

1. Staff can sign in with Firebase.
2. API receives and verifies Firebase token.
3. Firestore staff profile is found.
4. Role-specific UI appears.
5. Google Sheets data loads without local preview fallback.
6. Orders, customers, payments, rewards, vouchers, and unpaid flows work.
7. Missing profile, inactive account, missing env vars, or missing sheet tabs return clear errors.
