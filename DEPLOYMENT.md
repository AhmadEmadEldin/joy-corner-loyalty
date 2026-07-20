# Joy Corner Supabase Deployment

## Runtime architecture

```text
React static build
-> Supabase Auth
-> Supabase PostgreSQL + RLS + transactional RPCs
-> Supabase Realtime role-safe projections
-> integration_outbox
-> scheduled Google Sheets reporting worker
```

Firebase Hosting, Functions, Auth, and Firestore are retained only as an
explicit rollback system. They are not started by `npm run dev`, and Supabase
orders or receipts are never mirrored to Firestore.

## Frontend variables

```text
VITE_DATA_PROVIDER=supabase
VITE_SUPABASE_URL=https://ruurfhrjqfcydxbzpuqi.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=<publishable key>
```

Only these public values belong in the browser build. Never expose the
service-role key or Google credentials through a `VITE_` variable.

## Verify before deployment

```powershell
npm ci
npm run check
npm run e2e
npm run supabase:lint
npx supabase migration list --linked
```

Local-only migrations must be reviewed and explicitly approved before:

```powershell
npm run supabase:push
```

The React build is generated in `dist/` and requires an SPA rewrite to
`index.html`. Supabase provides the application backend; select a static
frontend host separately.

## Google Sheets reporting worker

Run this on a trusted scheduled server process:

```powershell
npm run sync:reporting
```

It requires `SUPABASE_SERVICE_ROLE_KEY`, the workbook ID, and one Google
service-account credential method from `.env.example`. It claims bounded outbox
batches, upserts by stable record ID, and retries failures with exponential
backoff. Sheet downtime does not delay or cancel customer orders.

## Legacy rollback only

```powershell
npm run dev:legacy
npm run e2e:legacy
npm run deploy:firebase
```

Do not run legacy and Supabase as simultaneous operational writers. Never
upload `.env`, `.env.local`, service-account JSON, or private keys.
