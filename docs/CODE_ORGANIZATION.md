# Code Organization

## Production Path

```text
Firebase Hosting
-> dist/index.html and dist/app.js
-> /api rewrite
-> firebase-functions.cjs
-> server/googleSheetsBackend.ts
-> Firestore profiles
-> Google Sheets
```

## Frontend

- `src/index.tsx` mounts the React app.
- `src/app.tsx` contains the staff dashboard and customer order portal.
- `src/firebase.ts` owns browser Firebase Auth and Firestore profile checks.
- `src/app.css` contains Joy Corner UI styling.
- `public/index.html` is the HTML shell.
- `public/assets/` is the single runtime asset folder copied into `dist/assets`.

Avoid adding production secrets, Google Sheets clients, or Canva API clients in `src/`.

## Backend

- `firebase-functions.cjs` exports the Firebase HTTPS Function named `api`.
- `server/googleSheetsBackend.ts` owns API routing, Firebase Admin token verification, Firestore role checks, and Google Sheets reads/writes.
- `server/sheetSchema.ts` defines sheet write headers and formula-protected columns.

Production Google Sheets auth uses the Firebase Functions runtime service account. The Sheet must be shared with that service account as Editor.

## Scripts

- `scripts/write_standalone_html.ts` copies `public/index.html` and `public/assets` into `dist` after build.
- `scripts/copy_env.ts` creates `.env.local` from `.env.example` for local setup only.
- `scripts/sync_firestore_staff.ts` is an optional local admin helper for syncing a `Staff` sheet into Firebase Auth and Firestore.

## Configuration

- `firebase.json` is the production deploy config.
- `.firebaserc` points to `joycornerapp-c784d`.
- `.env.local` is local only and ignored by Git.
- `.env.example` documents safe variable names only.
- `firestore.rules` controls browser Firestore access.

## Do Not Reintroduce

- Netlify production functions.
- Vercel production API routes.
- Apps Script web app calls.
- Service account JSON files committed to the repo.
- Browser-side Google Sheets private credentials.
