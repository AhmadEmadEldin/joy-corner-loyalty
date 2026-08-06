# Joy Corner UI/UX Implementation Plan

Plan date: 2026-07-29

## Current implementation audit

### Application structure

- `/` loads the authenticated staff portal.
- `/order` loads the authenticated customer portal.
- Staff access is role-filtered for Owner, Manager, Cashier, Waiter, and
  Barista.
- Customer access is limited to the signed-in customer's records.
- The frontend uses React 19, TypeScript, and centralized CSS.
- Operational data comes from the existing API and repository modules.

### Existing staff surfaces

- Overview
- New Order / POS
- Cashier
- Kitchen / Barista
- Orders and receipts
- Customers
- Rewards
- Vouchers
- Menu & Images
- Analytics
- End of Day
- System

### Existing customer surfaces

- Sign in and sign up
- Home
- Menu and product customization
- Cart and checkout
- Orders and tracking
- Receipts and unpaid receipts
- Rewards
- Vouchers
- Notifications
- Profile

## Findings

- `src/app.css` contains several generations of styling and duplicated
  responsive rules. The final Joy Corner layer must be explicit and imported
  last.
- `StaffPortal.tsx` is monolithic and relies on repeated page-header, metric,
  status, table, and empty-state patterns.
- Staff navigation uses letter placeholders instead of a coherent icon system.
- The staff shell can exceed comfortable desktop density; card grids and page
  headers need stronger minimum-width protection.
- Tablet and mobile drawers need the same focus management used by the mature
  mobile navigation component.
- Several empty states are plain paragraphs instead of actionable, semantic
  states.
- Loading presentation is inconsistent between portal boot, page data, and
  button actions.
- Generated design PNGs contain fake production data and must not be imported.
- Runtime styling must retain existing product availability, voucher, receipt,
  queue, validation, and permission behavior.

## Implementation phases

1. Establish the approved reference audit and source-of-truth documents.
2. Expand centralized tokens and add a final responsive stylesheet.
3. Create shared icon and UI primitives for headers, metrics, badges, panels,
   empty/error/loading states, buttons, controls, dialogs, tables, and drawers.
4. Rebuild the staff shell with grouped icon navigation, responsive top bar,
   focus-managed drawer, page context, and safe content sizing.
5. Standardize Overview, POS, queues, customer directory, rewards, vouchers,
   analytics, End of Day, System, and Owner Menu management.
6. Standardize customer authentication, home, menu, product details, cart,
   checkout, order tracking, receipts, rewards, vouchers, notifications, and
   profile.
7. Verify mobile, tablet, desktop, wide, keyboard, reduced motion, print, empty,
   loading, error, and overflow behavior.
8. Run TypeScript, ESLint, unit tests, production build, Playwright, and visual
   screenshot capture.

## Guardrails

- Preserve existing APIs, permissions, routes, price authority, menu data,
  customer ownership, order transitions, vouchers, loyalty, and reporting.
- Do not add mock production records or hardcoded operational totals.
- Do not import deprecated design PNGs into the runtime.
- Do not alter production, deploy, commit, or push as part of this redesign.
