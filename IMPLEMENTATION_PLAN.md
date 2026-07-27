# Implementation Plan

## Completed in this change

1. Source and design audit.
2. Central order/payment workflow and minor-unit helpers.
3. Operational integrity migration.
4. Auditable realtime catalog updates.
5. Product availability and cart reconciliation.
6. Cloudinary image-storage boundary and client compression.
7. Structured POS place details and enriched customer lookup.
8. Responsive dark staff shell and grouped navigation.
9. Owner catalog creation/edit/archive/image workflows.
10. Staff history, analytics, rewards, voucher, End-of-Day, and system readiness views.
11. Customer voucher and receipt visual improvements.
12. Unit/component tests, lint, type check, production build, and public/responsive browser QA.

## Release-blocking environment validation

1. Provide a staging `NEON_DATABASE_URL`.
2. Back up staging and run migrations through `005_operational_integrity.sql`.
3. Configure Cloudinary staging credentials.
4. Run `verify:api-workflow` against staging.
5. Execute authenticated owner, cashier, barista, and customer browser flows with real staging records.
6. Validate Cloudinary upload/replace/remove.
7. Validate reporting outbox delivery to a staging Google Sheet.
8. Capture the remaining real-data screenshots.

## Next functional tranche

1. Add transactional email and forgot-password delivery.
2. Add owner voucher issuance/cancellation/redemption-history APIs.
3. Add owner loyalty-rule and manual-adjustment APIs.
4. Add database-backed branch/tax/service/payment configuration.
5. Add staff and role administration.
6. Add QR receipt verification.
7. Add image crop and modifier-link editors.
8. Add shared event fan-out before scaling API replicas.

