# Joy Corner Netlify Deployment

## Deployment Flow

```text
VS Code -> GitHub -> Netlify -> Firebase Auth -> Netlify Function -> Firestore users/{uid} -> Google Sheets
```

## Netlify Build Settings

- Build command: `npm run build`
- Publish directory: `dist`
- Functions directory: `netlify/functions`

These are already configured in `netlify.toml`.

## Required Netlify Environment Variables

Add these in Netlify under Site configuration > Environment variables.

Frontend Firebase config:

```text
VITE_FIREBASE_API_KEY
VITE_FIREBASE_AUTH_DOMAIN
VITE_FIREBASE_PROJECT_ID
VITE_FIREBASE_APP_ID
VITE_FIREBASE_STORAGE_BUCKET
VITE_FIREBASE_MESSAGING_SENDER_ID
VITE_FIREBASE_MEASUREMENT_ID
```

Backend Google Sheets access:

```text
GOOGLE_SHEET_ID
GOOGLE_CLIENT_EMAIL
GOOGLE_PRIVATE_KEY
```

Backend Firebase Admin access:

```text
FIREBASE_PROJECT_ID
FIREBASE_CLIENT_EMAIL
FIREBASE_PRIVATE_KEY
```

Private keys must keep their newline escapes. In Netlify, paste them as one value with `\n` sequences if needed.

The backend also accepts old deploy variables `GOOGLE_SHEETS_SPREADSHEET_ID`, `GOOGLE_SERVICE_ACCOUNT_JSON`, and `FIREBASE_SERVICE_ACCOUNT_JSON`, but the clean split keys above are preferred.

## Firebase Setup

1. Enable Email/Password sign-in in Firebase Authentication.
2. Create each staff user in Firebase Authentication.
3. For each Auth user, create Firestore document `users/{uid}`.
4. Add `email`, `role`, `active`, and `displayName`.

If staff accounts are listed in the Google Sheet tab named `Staff`, run `npm run sync:staff` to sync those rows into Firebase Auth and Firestore.

## Google Sheets Setup

1. Enable Google Sheets API for the Google Cloud project that owns the service account.
2. Share `Joy_Corner_Integrated_WITH_Loyalty_Winners` with `GOOGLE_CLIENT_EMAIL` as Editor.
3. Set `GOOGLE_SHEET_ID` to the spreadsheet ID only.

## GitHub Flow

1. Commit changes locally.
2. Push to GitHub.
3. Netlify deploys automatically from the connected branch.

Do not upload `.env`, service account JSON files, or private keys to GitHub.
