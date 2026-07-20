# Code Organization

## Production Path

```text
Static host
-> dist/index.html and webpack chunks
-> src/RootApp.tsx
-> Supabase Auth + Data API
-> PostgreSQL RLS + transactional RPCs
-> integration_outbox
-> scheduled Google Sheets reporting worker
```

## Frontend

- `src/index.tsx` mounts the React app.
- `src/RootApp.tsx` selects Supabase before legacy code is loaded.
- `src/supabase/` contains the active customer/staff portals and data boundary.
- `src/app.tsx` and `src/firebase.ts` are the explicit legacy fallback.
- `src/app.css` contains Joy Corner UI styling.
- `public/index.html` is the HTML shell.
- `public/assets/` is the single runtime asset folder copied into `dist/assets`.

Avoid adding production secrets, Google Sheets clients, or Canva API clients in `src/`.

## Backend

- `supabase/migrations/` owns schema, RLS, grants, RPCs, projections, Storage,
  Realtime publication, and the reporting outbox.
- `scripts/sync_supabase_reporting.ts` is the server-only Sheets export worker.
- `server/reporting/sheetMappings.ts` owns explicit Supabase-to-tab mappings.
- `firebase-functions.cjs` and `server/googleSheetsBackend.ts` are rollback-only.

The reporting worker's Google service account must have Editor access to the
workbook. Browser code never receives its credentials.

## Scripts

- `scripts/write_standalone_html.ts` copies `public/index.html` and `public/assets` into `dist` after build.
- `scripts/copy_env.ts` creates `.env.local` from `.env.example` for local setup only.
- `scripts/sync_firestore_staff.ts` is an optional local admin helper for syncing a `Staff` sheet into Firebase Auth and Firestore.

## Configuration

- `supabase/config.toml` is the backend development configuration.
- `firebase.json` is retained only for rollback hosting/functions.
- `.firebaserc` points to `joycornerapp-c784d`.
- `.env.local` is local only and ignored by Git.
- `.env.example` documents safe variable names only.
- `firestore.rules` controls access only when legacy mode is intentionally used.

## Do Not Reintroduce

- Netlify production functions.
- Vercel production API routes.
- Apps Script web app calls.
- Service account JSON files committed to the repo.
- Browser-side Google Sheets private credentials.
