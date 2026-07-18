# Project Notes

This repository is now a standalone Joy Corner Loyalty staff web app.

- Frontend entry: `src/index.tsx`
- Main app: `src/app.tsx`
- Styling: `src/app.css`
- HTML shell: `public/index.html`
- Firebase Function entry: `firebase-functions.cjs`
- Node/Google Sheets backend: `server/googleSheetsBackend.ts`
- Canonical workbook schema: `server/sheets/schema.ts`
- Workbook audit/migration: `server/workbookMigration.ts` and `scripts/rebuild_workbook.ts`
- Offline queue/synchronization: `src/offline/`

The rebuilt workbook contract is exactly ten tabs: Dashboard, Settings, Staff,
Menu, Customers, Orders, Order Items, Payments, Loyalty, and System Log. Do not
reintroduce legacy operational tabs. Loyalty and System Log are typed ledgers,
selected with `recordType` and `eventType` respectively.

Never read or migrate a Staff password column. Staff authentication belongs in
Firebase Auth; Sheet staff rows contain identity, role, active state, and
permission metadata only.

Do not switch `GOOGLE_SHEET_ID` to a rebuilt copy until the production switch
checklist and rollback gate are explicitly approved.

Avoid adding third-party design SDKs or app manifests. Vouchers are generated internally by the Joy Corner backend.
