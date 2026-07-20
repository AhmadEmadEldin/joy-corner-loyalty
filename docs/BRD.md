# Joy Corner Loyalty - Business Requirements Document

## 1. Project Overview

Joy Corner Loyalty is a cafe operations and loyalty web application for Joy Corner staff and customers.

The app helps staff manage daily cafe orders, customer records, payments, unpaid balances, rewards, vouchers, pickup status, and end-day history. Customers can sign up, sign in, view the customer portal, and submit order requests.

The production app runs fully on Firebase with Google Sheets as the main business database.

## 2. Business Goals

- Give Joy Corner staff one simple dashboard for daily operations.
- Allow customers to sign up and request orders without accessing staff tools.
- Keep Google Sheets as the main editable business database.
- Secure all business data behind Firebase Authentication, Firestore roles, and Firebase Functions.
- Remove old production confusion from Netlify, Vercel, Apps Script, and local demo-only flows.
- Keep daily orders visible until staff marks them picked up or the owner runs End Day Reset.
- Maintain customer loyalty tracking and voucher workflows.

## 3. Final Production Architecture

```text
VS Code / Laptop
-> GitHub repository
-> Firebase Hosting
-> React frontend
-> Firebase Auth sign-in / signup
-> Firebase ID token
-> Firebase HTTPS Function: api
-> Firebase Admin verifies token
-> Firestore checks users/{uid} or customers/{uid}
-> Firebase Function reads/writes Google Sheets
-> React displays staff dashboard or customer portal
```

## 4. Deployment Platform

Production deployment platform:

```text
Firebase Hosting + Firebase Functions
```

Not part of final production architecture:

- Netlify Functions
- Vercel API routes
- Google Apps Script web app calls
- Browser-side Google service account usage
- Local mock data overriding production Google Sheets data

## 5. Core Users

### 5.1 Staff Users

Staff users sign in using Firebase Auth email/password.

Staff profile source:

```text
Firestore: users/{uid}
```

Required document structure:

```json
{
  "email": "owner@joycorner.com",
  "displayName": "Owner",
  "type": "staff",
  "role": "owner",
  "active": true,
  "createdAt": "server timestamp",
  "updatedAt": "server timestamp"
}
```

Allowed staff roles:

- `owner`
- `manager`
- `cashier`
- `waiter`
- `barista`

### 5.2 Customer Users

Customers sign up and sign in using Firebase Auth email/password.

Customer profile source:

```text
Firestore: customers/{uid}
```

Required document structure:

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

Customer signup should also register or update the customer in the Google Sheet where required by the app workflow.

## 6. Role Requirements

### 6.1 Owner

Owner can:

- View all dashboard data.
- View customers, orders, payments, unpaid tracker, rewards, vouchers, and history.
- Add and edit customer/order/payment workflows supported by the app.
- Run End Day Reset.
- Access full staff-level operational data.

### 6.2 Manager

Manager can:

- View most operational dashboards.
- Support cashier, waiter, and barista workflows.
- Review orders, payments, customers, rewards, and history.

Manager should not run owner-only reset controls unless explicitly allowed.

### 6.3 Cashier

Cashier can:

- Create receipts.
- Mark payment as paid or unpaid.
- Collect unpaid balances.
- View cashier-related dashboard sections.
- Access customer lookup and loyalty-related workflows needed for checkout.

Payment status must not remove the order from the live dashboard. Paid orders stay visible until picked up or end-day reset.

### 6.4 Waiter

Waiter can:

- Create or submit orders.
- View menu and customer/order information needed for service.
- Help mark orders picked up if allowed by the app flow.

### 6.5 Barista

Barista can:

- View barista/pickup order dashboard.
- Mark orders as picked up.

Barista should not see owner-only, cashier-only, or sensitive full-business controls unless explicitly allowed.

## 7. Authentication And Access Rules

- Staff and customers both use Firebase Auth.
- The frontend must get the Firebase ID token after login.
- The frontend must send the token to the backend using:

```text
Authorization: Bearer <Firebase ID token>
```

- Firebase Functions must verify the token using Firebase Admin.
- Staff access must be checked from `users/{uid}`.
- Customer access must be checked from `customers/{uid}`.
- Inactive profiles must be blocked.
- Missing profiles must be blocked with a clear error.
- Staff users must never be routed to customer-only pages by mistake.
- Customers must never access staff dashboards.
- Hardcoded staff emails should not be the main source of permissions.

## 8. Google Sheets Requirements

Main spreadsheet:

```text
Joy_Corner_Integrated_WITH_Loyalty_Winners
```

Spreadsheet ID:

```text
1e1z1pfNArVzaZs5FE4k0e3JqIlwJIPG_aWH4Fziqnl8
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

Supported helper tabs:

- `Staff`
- `Generated Vouchers`
- `History`

Google Sheets access must happen only inside Firebase Functions.

The frontend must never receive:

- Google service account private keys
- Google client email secrets
- Canva API secrets
- Any backend-only credential

## 9. Firebase Functions Requirements

The backend API is the Firebase HTTPS Function:

```text
api
```

Frontend calls:

```text
/api
```

Firebase Hosting rewrites `/api` and `/api/**` to the Firebase Function.

Required backend responsibilities:

- Verify Firebase ID token.
- Load Firestore staff or customer profile.
- Check role and active status.
- Read role-allowed Google Sheet tabs.
- Write orders, customers, payments, rewards, and history when allowed.
- Return JSON errors, not HTML pages.
- Keep Google Sheets credentials and secrets server-side only.

Current preferred Google Sheets authentication:

```text
Firebase Functions default runtime service account
```

Required Firebase secret:

```text
GOOGLE_SHEET_ID
```

The Google Sheet must be shared with the Firebase runtime service account as Editor.

## 10. Main App Features

### 10.1 Staff Dashboard

The staff dashboard should show role-appropriate sections for:

- Daily orders
- Pickup state
- Customers
- Menu
- Payments
- Unpaid tracker
- Rewards
- Loyalty winners
- Voucher redemptions
- History

### 10.2 Customer Portal

Customer portal should allow:

- Customer signup
- Customer sign-in
- Customer profile creation
- Customer order request
- Customer-only access control

### 10.3 Order And Receipt Workflow

Required order flow:

```text
Order created
-> Order appears on dashboard
-> Cashier marks Paid or Unpaid
-> Order stays on dashboard
-> Staff marks Picked Up
-> Order shows slash mark / picked-up visual state
-> Owner runs End Day Reset
-> Day is archived into history
```

Important business rule:

```text
Payment status and pickup status are separate.
```

Paid orders must not disappear from the dashboard.

### 10.4 End Day Reset

Owner can run End Day Reset.

End Day Reset should:

- Archive today into history.
- Keep customer history and rewards.
- Remove live dashboard visibility for archived day orders.
- Not delete important business records.

### 10.5 Loyalty And Rewards

The app should:

- Track paid eligible drink purchases.
- Calculate progress toward rewards.
- Show loyalty winners.
- Support voucher generation/redemption workflows.
- Keep reward records in Google Sheets.

## 11. Security Requirements

- All production business actions must go through Firebase Functions.
- Browser-side code must not call Google Sheets with private credentials.
- Firebase ID token is required for protected API actions.
- Firestore profile checks are required before role-specific actions.
- Role-based action allowlists must be enforced by the backend.
- Firestore rules must protect `users/{uid}` and `customers/{uid}`.
- Real secrets must not be committed to GitHub.
- `.env.example` should contain only placeholder variable names.

## 12. Environment Variables And Secrets

Frontend environment variables:

```text
VITE_FIREBASE_API_KEY
VITE_FIREBASE_AUTH_DOMAIN
VITE_FIREBASE_PROJECT_ID
VITE_FIREBASE_APP_ID
```

Firebase Function secret:

```text
GOOGLE_SHEET_ID
```

No production Google private key is required when using the Firebase Functions runtime service account.

## 13. Key Code Locations

- Frontend app: `src/app.tsx`
- Firebase browser setup: `src/firebase.ts`
- Firebase Function entry: `firebase-functions.cjs`
- Backend API and Google Sheets logic: `server/googleSheetsBackend.ts`
- Google Sheet schema helpers: `server/sheetSchema.ts`
- Firebase Hosting and Functions config: `firebase.json`
- Firebase project alias: `.firebaserc`
- Firestore security rules: `firestore.rules`
- Deployment guide: `DEPLOYMENT.md`
- Project README: `README.md`

## 14. Acceptance Criteria

The project is production-ready when:

1. Firebase Hosting loads the React app.
2. Staff can sign in with Firebase Auth.
3. Customers can sign up and sign in.
4. Staff profile is read from `users/{uid}`.
5. Customer profile is read from `customers/{uid}`.
6. Inactive or missing profiles are blocked.
7. Staff roles see only their allowed dashboards/actions.
8. Customers cannot access staff dashboards.
9. Firebase Functions verifies every protected token.
10. Firebase Functions reads and writes Google Sheets securely.
11. Google Sheets credentials are not exposed to the browser.
12. Paid orders remain visible on the dashboard.
13. Picked-up orders show the slash mark.
14. End Day Reset archives the day and clears the live dashboard.
15. History displays archived day information.
16. Build, lint, and type checks pass.
17. Firebase deploy completes successfully.

## 15. Deployment Commands

Run from:

```powershell
C:\Users\CYBER-TECH\CanvaProjects\joy-corner-loyalty
```

Install dependencies:

```powershell
npm install
```

Check the project:

```powershell
npm run lint
npm run lint:types
npm run build
```

Deploy everything:

```powershell
npm run deploy:firebase
```

Deploy hosting only:

```powershell
npm run deploy:firebase:hosting
```

Deploy functions only:

```powershell
npm run deploy:firebase:functions
```

## 16. Manual Firebase Console Steps

Before production use, confirm:

- Firebase Authentication Email/Password provider is enabled.
- Staff Auth users exist.
- Firestore `users/{uid}` documents exist for staff.
- Firestore `customers/{uid}` documents are created for customers.
- Firestore rules are published.
- Firebase project is on Blaze plan for Functions.
- Google Sheets API is enabled for the Firebase project.
- `GOOGLE_SHEET_ID` secret is set in Firebase Functions.
- The Sheet is shared with the Firebase Functions runtime service account as Editor.

## 17. Out Of Scope

The following are not required for the current production release:

- Rebuilding the UI from zero.
- Replacing Google Sheets with a different database.
- Netlify production deployment.
- Vercel production deployment.
- Apps Script production backend.
- Public unauthenticated staff dashboard access.

## 18. Open Future Enhancements

Possible future improvements:

- Add reporting charts for sales and rewards.
- Add stronger audit logs for staff actions.
- Add role management UI for owner.
- Add inventory stock management.
- Add receipt printing.
- Add automated voucher design generation if backend Canva integration is finalized.
