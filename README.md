# Joy Corner Loyalty

Joy Corner Loyalty is a React staff web app for cafe orders, customers, unpaid balances, rewards, vouchers, and daily dashboard work.

## Final Architecture

```text
Laptop / VS Code
-> GitHub
-> Netlify build and deploy
-> Firebase Auth email/password login
-> React gets Firebase ID token
-> React calls /api
-> Netlify redirects /api to netlify/functions/api.js
-> Backend verifies Firebase ID token
-> Backend reads Firestore users/{uid}
-> Backend enforces role permissions
-> Backend reads/writes Google Sheets
-> React renders the role-specific dashboard
```

## Important Files

- React app: `src/app.tsx`
- Firebase browser auth and staff profile read: `src/firebase.ts`
- Netlify Function entry: `netlify/functions/api.js`
- Backend auth, role checks, and Google Sheets access: `server/googleSheetsBackend.ts`
- Sheet write schema: `server/sheetSchema.ts`
- Netlify config: `netlify.toml`
- Required environment variables: `.env.example`

## Google Sheet

Use the spreadsheet named `Joy_Corner_Integrated_WITH_Loyalty_Winners`.

Set its ID in Netlify as:

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
- Keep `GOOGLE_CLIENT_EMAIL`, `GOOGLE_PRIVATE_KEY`, `FIREBASE_CLIENT_EMAIL`, and `FIREBASE_PRIVATE_KEY` as Netlify server-side environment variables.
- Rotate service account keys if they were ever pasted into public code, GitHub, old integrations, or frontend variables.
