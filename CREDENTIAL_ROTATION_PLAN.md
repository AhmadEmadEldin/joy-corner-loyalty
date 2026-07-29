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
| Neon credential rotation | COMPLETE | The historical username/password cannot authenticate to the direct staging endpoint; the app uses the current isolated staging credential |
| Cloudinary secret rotation | COMPLETE | No Cloudinary secret was found in `env.txt` or tracked repository content |
| Google service-account key revocation/replacement | COMPLETE | Google Cloud confirms all four historical keys are inactive; two historical service accounts no longer exist, and the current ignored key is a different replacement |
| JWT secret rotation | COMPLETE | No JWT secret was found in `env.txt` or tracked repository content; local JWT configuration meets the 32-character minimum |
| Deployment environment updates | COMPLETE FOR STAGING | Local staging API/worker use the replacement credentials; production settings were intentionally not changed |
| Local environment updates | COMPLETE | The staging connection is stored only in `.env.local`; no active `PGPASSWORD` copy is required |

## Neon verification

The historical credential was tested against the verified direct staging host
using a read-only connection attempt and could not authenticate. The current
replacement connection passed migrations, API workflow, and reporting.

## Google key verification

The four historical key IDs were checked in Google Cloud IAM. None is active.
Two referenced service accounts no longer exist; the remaining accounts do not
list the historical keys. The current replacement key successfully delivered
staging reporting records.

## Deployment and local hygiene

- Keep `.env`, `.env.local`, `env.txt`, service-account JSON, database URLs,
  Cloudinary secrets, and JWT secrets out of Git.
- Update Northflank/API and worker secrets only through encrypted provider
  settings.
- Do not put credentials in screenshots, logs, documentation, fixtures, or
  browser session exports.
- A separately approved history rewrite may reduce exposure but does not
  replace credential revocation.
