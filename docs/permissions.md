# Permissions

Permission catalog lives in `src/domain.ts`.

Role/action mapping lives in `src/permissions.ts` and is reused by the backend.

Owner receives every permission automatically. Other roles receive defaults, plus optional Firestore grants:

```json
{
  "permissions": ["payments.refund"],
  "revokedPermissions": ["customers.delete"]
}
```

Backend authorization requires:

- Firebase ID token
- Firestore staff profile
- active staff status
- valid role
- role or explicit feature permission
- no matching revoked permission

Owner staff management actions write audit events to Google Sheets Audit Log and Neon when configured.
