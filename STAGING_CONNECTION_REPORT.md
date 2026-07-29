# Staging Connection Report

Run date: 2026-07-29

No production service was changed.

| Integration | Evidence | Result |
|---|---|---|
| Neon | Direct, unpooled Neon host; SSL; database `neondb`; role `neondb_owner`; isolated branch `preview/agent/fix-code-errors` | PASS |
| Google Sheets | Native staging workbook, 20 tabs, Menu header/read access, service-account writer access | PASS |
| Cloudinary | Authenticated backend upload/replace/remove, four-role projection, audit and cleanup | PASS |
| Authentication | JWT secret present and at least 32 characters; value not displayed | PASS |

Cloudinary application signing uses an active credential pair stored only in
the ignored local environment and the exact staging folder
`joy-corner/staging/menu-items`.

Environment safety:

- `NODE_ENV` is development.
- `VITE_API_URL` and `FRONTEND_ORIGIN` are present.
- `DATABASE_SSL=true`.
- `MIGRATION_CONFIRM_STAGING=false` after the staging migration.
- Google uses the supported `GOOGLE_SERVICE_ACCOUNT_JSON` method.
- The staging Google Sheet ID is configured.
- `.env`, `.env.local`, `env.txt`, and service-account JSON patterns are ignored.

Sanitized Neon target:

- Host: `ep-summer-term-atqswgde.c-9.us-east-1.aws.neon.tech`
- Database: `neondb`
- Role: `neondb_owner`
- Branch: isolated staging preview

The live operational Google workbook and production Neon branch were not used.
