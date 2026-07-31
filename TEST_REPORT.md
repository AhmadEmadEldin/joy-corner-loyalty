# Test Report

Run date: 2026-07-30

## Final automated gates

| Gate | Result |
|---|---|
| TypeScript (`npm run lint:types`) | PASS |
| ESLint (`npm run lint`) | PASS |
| Git whitespace check (`git diff --check`) | PASS |
| Jest (`npm test -- --runInBand`) | PASS: 27 suites, 126 tests |
| Production webpack build (`npm run build`) | PASS with 2 size warnings |
| Playwright E2E (`npm run e2e`) | PASS: 10/10 |
| Authenticated responsive capture (`npm run verify:ui-redesign`) | PASS: 31 screenshots |

## Responsive capture coverage

- Desktop: all 12 staff/owner sections at 1440px.
- Tablet: POS, cashier, kitchen, and menu management at 820px.
- Mobile: sign-in, sign-up, home, menu, product details, cart, checkout,
  orders, tracking, receipts, unpaid receipts, rewards, vouchers,
  notifications, and account at 390px.
- The capture harness fails on page errors or horizontal viewport overflow.
- Evidence uses viewport captures to match the composition of the uploaded
  mockups rather than stitched full-page images.
- Sensitive login inputs are sanitized before screenshots are written.

## Build observations

Webpack reports the application entry (`app.js`, 337 KiB) and coffee-farm
artwork (290 KiB) above its recommended 244 KiB performance threshold. These
are warnings, not compilation failures, and are recorded as follow-up work.

## Manual visual inspection

Representative desktop, tablet, mobile home, cart, checkout, and tracking
screens were reviewed after the final capture. The dark theme, responsive
navigation, touch layouts, real-data states, and fallback imagery render
consistently. Missing staging product photography is visibly identified in menu
management rather than replaced with fake content.
