# Deployment

## Active architecture

The application uses Supabase Auth, PostgreSQL, RLS, RPCs, Realtime, and Storage.
The React `dist/` directory can be served by any static host with an SPA fallback
to `index.html`; frontend hosting is separate from the Supabase backend.

## Required checks

```powershell
npm ci
npm run check
npm run e2e
npm run supabase:lint
npx supabase migration list --linked
```

Review every local-only migration before requesting approval for
`npm run supabase:push`. A build or frontend deployment does not authorize a
database push.

Production currently includes migrations through
`20260720211217_reporting_outbox.sql`, applied after explicit approval on
2026-07-21.

The frontend runtime requires only:

```text
VITE_DATA_PROVIDER=supabase
VITE_SUPABASE_URL=<project URL>
VITE_SUPABASE_PUBLISHABLE_KEY=<publishable key>
```

The scheduled Google Sheets worker separately requires the service-role key,
spreadsheet ID, and one server-only Google credential method documented in
`.env.example`. Do not deploy `.env` or `.env.local`.

## Legacy rollback

Firebase Hosting/Functions commands remain available as explicit rollback tools
under `deploy:firebase:*`. They are not the normal Supabase backend and must not
run as a second writer during normal operation.
