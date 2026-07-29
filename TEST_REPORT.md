# Test Report

Run date: 2026-07-29

## Automated gates

| Gate | Result |
|---|---|
| TypeScript | PASS |
| ESLint | PASS |
| Jest | PASS |
| Production webpack build | PASS |
| Playwright browser suite | PASS: 10/10 |
| Migration 005 preflight | READY |
| Migration 005 dry run | PASS |
| Migration 005 staging execution | PASS |
| Menu normalization | PASS: 165 products, 227 variants, 0 findings |
| Owner menu import | PASS |
| Google reporting delivery/retry/idempotency | PASS |
| Multi-role authenticated workflow | PASS |
| End Day and second no-op reporting sync | PASS |
| Cloudinary connector metadata/upload/delete | PASS |
| Cloudinary application signed upload | BLOCKED by missing local API credentials |

## Coverage added

- deterministic menu IDs, variants, display order, minor-unit pricing, duplicate
  Sahlab classification, schema validation, and secret screening;
- Owner-only preview/apply with digest confirmation, transaction rollback,
  audit, archives, historical price protection, and validation failures;
- auth rate limiting, mandatory JWT configuration, customer ownership,
  role-filtered data, and duplicate operation defenses;
- image magic-byte validation and safe timestamped replacement;
- migration target/checksum/transaction guards and no synthetic history;
- customer checkout, price authority, unavailable state, cashier confirmation
  and payment, barista transitions, queue removal, receipt retention, voucher
  single redemption, loyalty single award, Sheet delivery, and End Day.

The final gate commands are rerun immediately before commit.
