# Staging Setup

Staging must use separate Neon, Google Sheets, Cloudinary, API, and frontend
resources. Never reuse production credentials or endpoints for migration
validation.

## Environment placeholders

Store these values only in `.env.local` or the platform's encrypted environment
settings. Never commit populated values.

```dotenv
NEON_DATABASE_URL=<direct-unpooled-neon-staging-connection-string>
DATABASE_SSL=<true>
CLOUDINARY_CLOUD_NAME=<staging-cloud-name>
CLOUDINARY_API_KEY=<staging-api-key>
CLOUDINARY_API_SECRET=<staging-api-secret>
CLOUDINARY_FOLDER=<joy-corner/staging/menu-items>
GOOGLE_SHEET_ID=<copied-staging-workbook-id>
GOOGLE_SERVICE_ACCOUNT_JSON=<staging-service-account-json>
JWT_SECRET=<at-least-32-random-characters>
FRONTEND_ORIGIN=<staging-frontend-origin>
VITE_API_URL=<staging-api-url-ending-in-api>
```

For the explicit staging migration command also set:

```dotenv
MIGRATION_CONFIRM_STAGING=true
NODE_ENV=development
```

Do not set `MIGRATION_CONFIRM_STAGING=true` globally or in production.

## Neon

- Create a dedicated staging branch separate from production.
- Record and independently verify the staging branch ID and endpoint.
- Use the direct, unpooled connection string for preflight and migration.
- Require SSL.
- Create and verify a timestamped pre-migration restore branch immediately
  before applying migration 005.
- After migration 005 is recorded, staging runtime may use its separately
  configured pooled endpoint if desired.

## Google Sheets

- Make a copy of the operational workbook for staging.
- Use the copied workbook ID, never the operational sheet ID.
- Grant only the staging service account access to the copied workbook.
- Verify headers against the reporting mappings before enabling the worker.

## Cloudinary

- Use staging-specific credentials or an isolated staging upload preset.
- Set `CLOUDINARY_FOLDER` exactly to:
  `joy-corner/staging/menu-items`.
- Verify upload, replace, and delete using a disposable staging menu item.
- Do not place staging uploads in the production folder.

## Authentication and origins

- Generate a unique staging `JWT_SECRET` with at least 32 random characters.
- Configure `FRONTEND_ORIGIN` with only the staging frontend origin.
- Configure `VITE_API_URL` with only the staging API `/api` endpoint.
- Never reuse the production JWT secret.

## Local safety

- Keep `.env` and `.env.local` ignored.
- Never paste credentials into source files, documentation, screenshots,
  terminal transcripts, or issue comments.
- Run `MIGRATION_005_PREFLIGHT.sql` and retain its non-sensitive report.
- Remove `MIGRATION_CONFIRM_STAGING` after migration validation.
