# Database

## Neon

Schema file: `docs/neon-schema.sql`

Migration command:

```powershell
npm run migrate:neon
```

Required backend-only environment:

```text
NEON_DATABASE_URL=
NEON_BACKUP_ENABLED=true
```

The schema includes users, roles, permissions, role permissions, user permissions, customers, normalized menu tables, orders, order items, extras, payments, unpaid accounts, rewards, winners, redemptions, business days, daily archives, audit logs, sync jobs, and sync failures.

If Neon is not configured, the app continues using Firebase + Google Sheets and records Neon as unavailable in health checks.
