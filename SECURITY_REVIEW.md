# Security Review

Run date: 2026-07-29

Result: **PASS for code review; credential rotation remains operational**

The repository received a complete security scan (scan
`b843db84-5301-485d-9890-c0491d04467a`). Five validated findings were fixed:

- authentication rate limiting;
- mandatory JWT secret length and production-safe readiness behavior;
- backend role limits on sensitive routes and projections;
- customer ownership and request idempotency enforcement;
- duplicate/unsafe operational state transitions.

Additional verified controls:

- PostgreSQL parameters are bound, and checkout prices are reloaded from Neon;
- payment references, voucher redemption, and loyalty awards are idempotent;
- CORS uses the configured frontend origin;
- sessions expire and use HTTP-only cookies;
- SSE endpoints authenticate before subscription;
- image uploads use magic-byte validation and backend-only Cloudinary signing;
- migration 005 has direct-host, SSL, environment, confirmation, checksum,
  restore-point, and transaction gates;
- Google credentials and Cloudinary secrets remain backend-only and ignored;
- customer projections are role-filtered;
- logs and reports do not intentionally include secret values.

Gitleaks 8.30.1 found the known PostgreSQL exposure plus four historical Google
service-account private keys. None remains tracked, and the current ignored
Google key differs from all historical keys. Provider-side revocation of the
old Neon credential and four old Google keys must still be confirmed. Git
history was not rewritten.
