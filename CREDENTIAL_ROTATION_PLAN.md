# Credential Rotation Plan

Review date: 2026-07-29

Gitleaks 8.30.1 scanned 116 commits. `env.txt` contained a real-looking
PostgreSQL credential in `004e7eb1c03d2e9ca7cf9c178ad3bb312b47c2e9`.
Four Google service-account JSON files containing private keys also existed in
history in commits `ea11b1c735f1915bda3127800bf3269cd4d3ffe0`,
`f5254d63a9bebae7e46d813c4d4d4b5430a3cd20`, and
`543e36a86fb1284f745534d4193cad00c96bbf0d`. No value is reproduced here.
Git history was not rewritten.

| Item | Status | Required action |
|---|---|---|
| Neon credential rotation | INCOMPLETE | Confirm the exposed role/password is revoked provider-side; the local staging app now uses the current isolated staging credential |
| Cloudinary secret rotation | COMPLETE | No Cloudinary secret was found in `env.txt` or tracked repository content |
| Google service-account key revocation/replacement | INCOMPLETE | The current ignored local key is different from every historical key, but provider-side revocation of the four historical keys must be confirmed |
| JWT secret rotation | COMPLETE | No JWT secret was found in `env.txt` or tracked repository content; local JWT configuration meets the 32-character minimum |
| Deployment environment updates | BLOCKED | Production/deployment credential changes are outside this staging-only run; update only after provider-side Neon rotation is confirmed |
| Local environment updates | COMPLETE | The staging connection is stored only in `.env.local`; no active `PGPASSWORD` copy is required |

## Neon rotation completion

1. Revoke or reset the credential associated with the historical exposure.
2. Confirm the old credential can no longer authenticate.
3. Update encrypted staging/deployment environments if the replacement differs.
4. Restart affected API and worker services and verify readiness and reporting.

## Google key revocation completion

1. In Google Cloud IAM, locate the service accounts referenced by the historical
   JSON files.
2. Revoke/delete the four historical private-key IDs.
3. Keep only the current replacement key required by the staging worker.
4. Confirm the staging Sheet sync still succeeds.
5. Confirm historical keys can no longer authenticate.

## Deployment and local hygiene

- Keep `.env`, `.env.local`, `env.txt`, service-account JSON, database URLs,
  Cloudinary secrets, and JWT secrets out of Git.
- Update Northflank/API and worker secrets only through encrypted provider
  settings.
- Do not put credentials in screenshots, logs, documentation, fixtures, or
  browser session exports.
- A separately approved history rewrite may reduce exposure but does not
  replace credential revocation.
