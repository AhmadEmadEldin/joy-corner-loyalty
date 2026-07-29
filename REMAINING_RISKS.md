# Remaining Risks

Run date: 2026-07-29

## Staging blocker

- Cloudinary API key and secret are not present in the ignored local
  environment. The authenticated connector metadata test and disposable
  upload/delete passed, but backend signed upload/replace/remove and cross-role
  image propagation remain unverified.

## Operational follow-up

- The PostgreSQL credential formerly committed in `env.txt` must remain treated
  as compromised until provider-side revocation is confirmed.
- Four historical Google service-account keys must remain treated as
  compromised until provider-side revocation is confirmed. The current ignored
  staging key is a different key.
- The staging Google Sheet Menu tab contains 28 spelling/name differences and
  the original duplicate; Neon and normalized JSON are authoritative.
- In-process SSE assumes one API replica. Multi-replica deployment requires a
  shared event transport.
- The main bundle and coffee-farm artwork should be monitored on constrained
  mobile networks.
- Forgot-password delivery, staff administration, advanced loyalty management,
  crop editing, and database-backed business settings are product enhancements,
  not blockers for the tested staging workflow.

Production migration, deployment, and credential changes require a separate
review and are intentionally not performed.
