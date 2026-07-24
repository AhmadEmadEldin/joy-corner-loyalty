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

Neon is the only supported database backend. If `NEON_DATABASE_URL` is not configured, the server will not start.
