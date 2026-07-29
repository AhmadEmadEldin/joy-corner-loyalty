# Remaining Risks

Run date: 2026-07-29

## Staging blockers

None.

## Operational follow-up

- The historical PostgreSQL login and four historical Google private keys are
  inactive. They remain in Git history because history was intentionally not
  rewritten; rotation, not deletion of history, is the compensating control.
- The active Cloudinary credential is intentionally local-only. Deployment
  environments must receive it through their secret manager, never Git.
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
