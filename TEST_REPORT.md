# Test Report

Run date: 2026-07-27

## Automated results

| Check | Result |
|---|---|
| TypeScript `tsc --noEmit` | Pass |
| ESLint | Pass |
| Jest | Pass: 20 suites, 88 tests |
| Production webpack build | Pass |
| Browser public/auth render | Pass |
| Browser horizontal overflow at 390, 900, and 1440px | Pass |
| Browser framework overlay after fixes | Pass |

Production build warnings:

- `app.js` is approximately 301 KiB.
- Coffee-farm artwork is approximately 1.42 MiB.

These are performance risks, not build failures. Optimize the PNG and consider further lazy chunking before a constrained-network launch.

## New coverage

- Canonical order sequence.
- Role ownership of cashier/barista transitions.
- Legacy status normalization.
- Unpaid, partial, and paid derivation from minor units.
- Decimal-to-minor conversion.
- Cart price-change detection and checkout blocking.
- Cart unavailable-item invalidation.
- Egyptian local phone normalization.
- Legacy Google Sheets status import into canonical order states.
- Imported confirmation and completion timestamp derivation.
- End of Day completion counting based on `picked_up`.
- Full canonical API transition sequence.
- Migration 005 targeted updates, constraint guards, duplicate preflight, and
  no-synthetic-history assertions.

Existing coverage continues to pass for permissions, receipt calculations/printing/visual state, menu normalization, customer menu/product dialog, mobile navigation, customer navigation, reporting mappings/write plan, cart drafts, and repository projections.

## Browser QA

The local frontend was run at `http://localhost:8081`.

Verified:

- meaningful content rendered;
- no blank page;
- no webpack overlay after fixes;
- staff and customer auth visuals;
- desktop staff shell and every navigation destination with empty QA projections;
- tablet POS/Cashier/Barista/Menu layouts;
- mobile auth/customer shell layouts;
- customer drawer navigation after sticky-header fix;
- no horizontal overflow at tested widths.

The local backend could not start because `NEON_DATABASE_URL` is empty. Expected connection-refused console messages on unauthenticated restore requests are therefore environment failures, not frontend runtime exceptions.

## Required staging tests

The following must run with real staging data before production approval:

- customer signup/login and staff role redirect;
- customer lookup/autofill/create;
- price edit SSE propagation to four roles;
- cart acknowledgement and unavailable replacement;
- staff POS variants/modifiers/place details/payment;
- duplicate confirmation and duplicate payment idempotency;
- complete customer → cashier → barista → pickup flow;
- completed-order queue removal;
- customer live tracking;
- loyalty award exactly once;
- voucher redemption exactly once;
- receipt consistency and verification;
- image upload/replace/remove;
- End-of-Day blocking and idempotency;
- reporting worker retry/delivery;
- all required real-data screenshots.
