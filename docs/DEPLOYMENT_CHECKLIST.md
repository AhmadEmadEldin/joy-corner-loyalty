# Deployment checklist

- Run `npm ci`, `npm run lint:types`, `npm run lint`, `npm test`, and `npm run build`.
- Confirm `.env.local`, service-account files, secrets, and plaintext passwords are untracked.
- Confirm `GOOGLE_SHEET_ID` points to the production workbook and its locale/timezone remain `ar_EG` / `Africa/Cairo`.
- Share the workbook with the Firebase Functions runtime service account.
- Run schema validation read-only first; review missing/duplicate headers before any repair.
- Verify Firebase Auth plus Firestore roles for owner, manager, cashier, waiter, and barista.
- Smoke-test customer request/confirmation, manager approval, barista sequence, partial/full payment, voucher reserve/redeem, and an End Day dry-run scenario.
- Deploy Functions, rules, then Hosting; inspect Function logs, `Audit Log`, `Sync Failures`, and `Schema Status`.
- Keep a Drive backup before structural Sheet changes and document rollback owners.
