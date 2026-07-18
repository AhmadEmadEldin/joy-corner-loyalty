# Deployment

Active target: Firebase Hosting + Firebase Functions.

Commands:

```powershell
npm run check
npm run e2e
npm run deploy:firebase
```

Required production checks:

- Firebase Auth Email/Password enabled
- Firestore enabled
- `GOOGLE_SHEET_ID` set as a Firebase Function secret
- Google Sheet shared with the Firebase Functions runtime service account
- optional Neon secrets configured before enabling backup writes
- SPA rewrites active in `firebase.json`
- `/health` returns success
- favicon and manifest load in deployed browser

Do not deploy root `.env` or `.env.local`.
