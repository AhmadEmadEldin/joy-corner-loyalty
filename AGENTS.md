# Project Notes

This repository is now a standalone Joy Corner Loyalty staff web app.

- Frontend entry: `src/index.tsx`
- Main app: `src/RootApp.tsx`
- Styling: `src/app.css`
- HTML shell: `public/index.html`
- Northflank API entry: `server/api.ts`
- Neon schema: `server/migrations/001_initial.sql`
- Google Sheets reporting worker: `scripts/sync_neon_reporting.ts`

Avoid adding Canva SDK imports or Canva app manifest files unless the project is intentionally converted back into a Canva app.
