# Joy Corner Firebase Deployment

## Deployment Flow

```text
VS Code -> GitHub -> Firebase Hosting -> Firebase HTTPS Function -> Firestore users/{uid} -> Google Sheets
```

Firebase Hosting serves the React build from `dist`. Requests to `/api/**` are rewritten to the Firebase Function named `api`.

## Firebase Project

The repo is configured in `.firebaserc` for:

```text
joycornerapp-c784d
```

Change `.firebaserc` if you deploy to a different Firebase project.

## Required Environment Variables

Frontend Firebase config is needed at build time:

```text
VITE_FIREBASE_API_KEY
VITE_FIREBASE_AUTH_DOMAIN
VITE_FIREBASE_PROJECT_ID
VITE_FIREBASE_APP_ID
VITE_FIREBASE_STORAGE_BUCKET
VITE_FIREBASE_MESSAGING_SENDER_ID
VITE_FIREBASE_MEASUREMENT_ID
```

Google Sheets backend access is needed by the Firebase Function:

```text
GOOGLE_SHEET_ID
GOOGLE_CLIENT_EMAIL
GOOGLE_PRIVATE_KEY
```

For local `.env`, these variables are read directly. For deployed Firebase Functions, use Firebase Secret Manager:

```powershell
firebase functions:secrets:set GOOGLE_SHEET_ID
firebase functions:secrets:set GOOGLE_CLIENT_EMAIL
firebase functions:secrets:set GOOGLE_PRIVATE_KEY
```

Compatibility variables still accepted:

```text
GOOGLE_SHEETS_SPREADSHEET_ID
GOOGLE_SERVICE_ACCOUNT_JSON
FIREBASE_SERVICE_ACCOUNT_JSON
```

## Firebase Setup

1. Enable Firebase Authentication Email/Password.
2. Enable Firestore.
3. Create staff Auth users, or keep them in the Google Sheet tab named `Staff`.
4. Create Firestore documents at `users/{uid}` with `email`, `role`, `active`, and `displayName`.
5. Run `npm run sync:staff` to sync the `Staff` sheet into Firebase Auth/Firestore when network credentials are working.

## Google Sheets Setup

1. Enable Google Sheets API in Google Cloud.
2. Share `Joy_Corner_Integrated_WITH_Loyalty_Winners` with `GOOGLE_CLIENT_EMAIL` as Editor.
3. Set `GOOGLE_SHEET_ID` to the spreadsheet ID only.

## Deploy

```powershell
npm install
npm run lint:types
npm run build
npm run deploy:firebase
```

Deploy only Hosting:

```powershell
npm run deploy:firebase:hosting
```

Deploy only Functions:

```powershell
npm run deploy:firebase:functions
```

Do not upload `.env`, service account JSON files, or private keys to GitHub.
