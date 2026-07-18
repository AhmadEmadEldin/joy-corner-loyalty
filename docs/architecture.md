# Joy Corner Architecture

Joy Corner is a standalone staff POS and loyalty web app.

- React/webpack renders staff, customer order, owner, waiter, cashier, and barista screens.
- Firebase Authentication verifies staff and customer identity.
- Firestore `users/{uid}` stores staff role, active state, explicit permissions, and revoked permissions.
- Firebase Hosting rewrites `/api` to the Express/Firebase Function backend.
- The backend is the authority for role checks, price validation, receipt totals, payment state, End Day, audit logging, and integrations.
- Google Sheets remains the operational reporting layer.
- Neon PostgreSQL is implemented as the normalized historical/reporting backup when `NEON_DATABASE_URL` and `NEON_BACKUP_ENABLED=true` are configured.

Browser code must never receive Google service account keys, Firebase Admin keys, Neon connection strings, or other backend secrets.
