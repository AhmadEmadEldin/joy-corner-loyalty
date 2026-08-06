# Joy Corner App — Preliminary Audit Report

**Project:** Joy Corner Loyalty & Coffee Operations App  
**Audit type:** UI/UX, workflow, order-state, payment, customer-tracking, and deployment-surface review  
**Prepared from:** Provided application screenshots, Instagram brand references, and endpoint verification results  
**Status:** Preliminary — requires repository and database inspection for code-level confirmation  
**Date:** 2026-07-26

---

## 1. Executive Summary

The application is reachable and its basic HTTP surface is healthy, but the current product is not ready for dependable café operations.

The primary problems are not limited to styling. The screenshots indicate broken or inconsistent business logic across the complete order lifecycle:

**Customer order → Cashier confirmation → Barista preparation → Ready → Pickup → Receipt → Loyalty history**

The application currently shows signs of:

- Inconsistent order and payment states
- Broken or incomplete action buttons
- Historical completed orders remaining in active operational queues
- Incorrect cashier calculations
- Missing order-place details
- Weak customer identification and auto-fill behavior
- Non-real-time customer tracking
- Navigation overflow and poor responsive behavior
- Placeholder product images instead of real menu photography
- Visual identity that does not reflect the Joy Corner Instagram brand
- Legacy data leaking into live operational screens

The endpoint tests confirm that the web server, React SPA fallback, health routes, readiness route, and menu API are responding. This is useful, but it does **not** confirm that the ordering workflow, permissions, database writes, calculations, real-time listeners, or role transitions are correct.

---

## 2. Verified Deployment Surface

The following results were provided:

| Endpoint | Status | Result |
|---|---:|---|
| `GET /` | 200 | React app HTML returned |
| `GET /order` | 200 | SPA fallback works |
| `GET /health` | 200 | `{"ok":true}` |
| `GET /ready` | 200 | Database reachable; approximately 90 ms latency |
| `GET /api/menu` | 200 | Menu payload returned; approximately 69 KB |
| `GET /api/nonexistent` | 404 | Correct JSON 404 |
| `GET /nonexistent.js` | 404 | Missing asset correctly rejected |

### Interpretation

The application server is alive and routing behavior is broadly correct.

This verifies:

- Frontend hosting is active
- Client-side routes are served
- Basic health endpoint works
- Database connectivity exists
- Menu API returns data
- Unknown API routes return 404
- Unknown static assets return 404

This does **not** verify:

- Authentication correctness
- Role authorization
- Order creation
- Payment calculations
- Confirmation transactions
- Barista queue updates
- Customer real-time tracking
- Loyalty point integrity
- Voucher redemption safety
- Image upload/storage
- End-of-day behavior
- Security rules

---

## 3. Current Product Areas Observed

### Owner

Observed sections include:

- Overview
- New Order
- Cashier
- Menu & Images
- Voucher Requests
- Orders & Receipts
- Analytics
- End of Day
- System
- Kitchen
- Customers

### Cashier

Observed capabilities include:

- New Order
- Cashier queue
- Customers
- Confirmation/payment screen
- Receipt printing
- Close action

### Barista

Observed capabilities include:

- Kitchen queue
- Order status cards
- Pickup state

### Customer

Observed capabilities include:

- Menu
- Cart
- Orders
- Receipts
- Unpaid receipts
- Rewards
- Vouchers
- Updates
- Sign out

---

## 4. Critical Findings

## 4.1 Order State Model Is Inconsistent

### Evidence

Completed orders marked **Picked up** remain visible inside active Cashier and Barista screens.

Orders with very old elapsed times are displayed in live operations, including records with hundreds of hours elapsed.

### Risk

- Staff cannot distinguish current orders from archived orders
- Active counts become misleading
- New orders can be missed
- Kitchen workflow becomes unsafe during busy periods
- Analytics may count legacy and active records incorrectly

### Required Fix

Create one central order-state model:

- `DRAFT`
- `SUBMITTED`
- `AWAITING_CONFIRMATION`
- `CONFIRMED`
- `IN_PREPARATION`
- `READY`
- `PICKED_UP`
- `CANCELLED`
- `REJECTED`

All pages must use the same constants and transition validation.

Completed states must be excluded from active operational queries.

---

## 4.2 Payment Status Contradicts Payment Values

### Evidence

Some cards display a **PAID** badge while also showing:

- Paid: `EGP 0.00`
- Remaining: full order amount

Some notes contain statements such as “settled unpaid” while the visible status and balances are inconsistent.

### Risk

- Incorrect cash reconciliation
- Wrong unpaid tracking
- Customer disputes
- False end-of-day totals
- Loyalty points potentially awarded to unpaid orders

### Required Fix

Separate `orderStatus` from `paymentStatus`.

Use:

- `UNPAID`
- `PARTIALLY_PAID`
- `PAID`
- `REFUNDED`
- `VOIDED`

Calculate on the trusted backend:

```text
remaining = max(total - amountPaid, 0)
```

Rules:

```text
amountPaid <= 0                  → UNPAID
0 < amountPaid < total          → PARTIALLY_PAID
amountPaid >= total             → PAID
```

Never allow the UI to assign `PAID` directly.

---

## 4.3 Cashier POS Is Incomplete

### Evidence

The New Order screen displays menu items and a customer/payment form, but does not appear to provide a complete POS workflow.

Missing or unclear areas include:

- Full cart
- Quantity controls
- Size/variant controls
- Extras
- Per-item notes
- Discounts
- Voucher application
- Paid amount
- Remaining balance
- Structured order-place details
- Final receipt preview
- Clear validation
- Duplicate-submit protection

### Risk

- Incorrect totals
- Staff enter incomplete orders
- Order details are pushed into free-text notes
- Kitchen receives ambiguous instructions
- Customer and cashier totals may differ

### Required Fix

Rebuild the POS into:

**Left:** searchable menu and category filters  
**Center:** cart and product customization  
**Right:** customer, order-place, payment, totals, and confirmation

All totals must be recalculated server-side before confirmation.

---

## 4.4 Customer Lookup Does Not Reliably Auto-Fill Identity

### User requirement

When the cashier enters a known customer phone number, the application should automatically populate the customer name.

### Current concern

The form contains a phone search field, but the screenshots do not demonstrate a reliable customer resolution workflow.

### Required Fix

- Normalize Egyptian phone numbers before lookup
- Search by normalized phone
- Return a stable customer ID
- Auto-fill the customer name
- Show points, vouchers, unpaid balance, and recent orders
- Offer quick customer creation when no match exists
- Prevent duplicate customer profiles

Phone number should be a lookup key, not the database primary key.

---

## 4.5 Confirmation Button and Workflow Are Not Trustworthy

### Reported problem

The Confirm button does not work correctly.

### Likely failure areas

- UI handler not connected
- Incorrect API route
- Failed validation hidden from user
- Status string mismatch
- Database write succeeds partially
- Cashier and kitchen use different collections or filters
- Frontend state changes without a committed backend transaction
- Race condition or stale cache
- Permission rule rejection
- Duplicate submission guard missing

### Required Fix

Confirmation must execute one safe backend operation:

1. Validate role
2. Validate current state
3. Validate customer and order-place information
4. Recalculate totals
5. Save payment
6. Transition to `CONFIRMED`
7. Append status history
8. Generate/finalize receipt
9. Publish to kitchen queue
10. Update customer tracking
11. Return committed order snapshot

Failure must leave the order in its previous valid state.

---

## 4.6 Missing Structured Order-Place Options

### Required operational options

- Dine in
- Takeaway
- Car
- Outside
- Delivery

### Conditional fields

**Dine in**
- Table number

**Takeaway**
- Pickup name
- Optional pickup time

**Car**
- Car color
- Car model
- Optional plate number

**Delivery**
- Address
- Phone
- Delivery notes
- Delivery fee

### Current concern

Order location details appear to be mixed into free-text customer notes.

### Required Fix

Use structured fields:

```json
{
  "orderPlace": "CAR",
  "placeDetails": {
    "carColor": "Black",
    "carModel": "Toyota",
    "plateNumber": ""
  }
}
```

Do not store operational state, receipts, payment transitions, or pickup events inside notes.

---

## 4.7 New and Completed Order Sorting Is Wrong

### Evidence

Old completed orders remain above or mixed with new operational records.

### Required Fix

Default active views:

- Newest active order first for cashier
- Configurable oldest-first preparation view for kitchen

Completed orders must be moved to History immediately after pickup.

Badge counts must query active statuses only.

---

## 4.8 Filters Are Incomplete or Misleading

### Required Cashier filters

- Active
- New
- Awaiting confirmation
- Confirmed
- Ready
- Unpaid
- Partially paid
- Paid
- Completed
- Cancelled
- History

### Required Barista filters

- New
- In preparation
- Ready
- History

Barista must not receive:

- Awaiting confirmation
- Rejected
- Cancelled
- Picked up

---

## 4.9 Barista Workflow Is Not Properly Sequenced

### Correct sequence

```text
CONFIRMED
→ Start preparation
→ IN_PREPARATION
→ Mark ready
→ READY
→ Mark picked up
→ PICKED_UP
```

### Required behavior

- Each action available only in the correct state
- Button disabled during save
- Status changes persisted to backend
- Customer updated immediately
- Completed card removed from active queue
- Timestamp recorded for every stage

Barista must not control payment or cashier closing actions.

---

## 4.10 Customer Tracking Is Not Real-Time

### Reported problem

Customer order tracking does not update immediately after cashier or barista actions.

### Required Fix

Use the existing real-time provider:

- Firestore listeners, or
- Supabase real-time, or
- WebSocket/SSE if already implemented

The customer timeline should show:

1. Order received
2. Waiting for confirmation
3. Confirmed
4. Being prepared
5. Ready
6. Picked up

Listeners must reconnect safely and be cleaned up when components unmount.

---

## 4.11 Navigation Is Broken and Overcrowded

### Evidence

Owner navigation labels overlap, clip, and run together.

Examples include multiple sections compressed into one horizontal row.

### Risk

- Staff select the wrong page
- Mobile use becomes impractical
- Low discoverability
- Poor accessibility

### Required Fix

Use grouped owner navigation.

**Operations**
- Overview
- New Order
- Cashier
- Kitchen

**Customers**
- Customers
- Rewards
- Vouchers

**Catalog**
- Menu
- Product Images

**Business**
- Analytics
- End of Day
- System

Use a desktop sidebar and mobile drawer.

---

## 4.12 Product Image Experience Is Unacceptable

### Evidence

The Joy Corner logo is enlarged and reused as the product image across menu cards.

The owner screen reports a large number of missing images.

### Risk

- Customer menu looks unfinished
- Products are hard to distinguish
- Brand quality is reduced
- Conversion and order confidence suffer

### Required Fix

Store real product images in:

- Firebase Storage, or
- Supabase Storage, or
- Cloudinary

Do not store binary images in Google Sheets.

Recommended path:

```text
menu-items/{productId}/main-{timestamp}.webp
```

Store only URL and metadata in the product record.

Required image-management features:

- Upload
- Replace
- Crop
- Compress
- Thumbnail generation
- Missing-image filter
- Progress
- Secure validation
- Product ID mapping

---

## 4.13 Brand Identity Does Not Match Joy Corner

### Instagram identity observed

The provided Instagram feed communicates:

- Strong black background
- Cream and white typography
- Caramel/orange accents
- High-contrast product photography
- Editorial coffee imagery
- Modern premium personality
- Minimal layouts
- Youthful lifestyle content
- Black branded cups
- Occasional saturated accent campaigns

### Current app problem

The app uses large flat brown panels, weak hierarchy, excessive empty space, generic controls, and inconsistent branding.

### Required Fix

Use the generated Joy Corner design system as the visual source of truth.

Core tokens:

```css
:root {
  --jc-espresso: #2B1B14;
  --jc-coffee: #4A2C20;
  --jc-caramel: #B9783D;
  --jc-gold: #D6A756;
  --jc-cream: #F7F0E4;
  --jc-ivory: #FFFDF8;
  --jc-mocha-gray: #786A61;

  --jc-success: #387A52;
  --jc-warning: #C67B2D;
  --jc-danger: #B8463D;
  --jc-info: #3882F6;

  --jc-radius-xs: 4px;
  --jc-radius-sm: 8px;
  --jc-radius-md: 12px;
  --jc-radius-lg: 16px;
  --jc-radius-xl: 24px;
  --jc-radius-2xl: 32px;

  --jc-space-1: 4px;
  --jc-space-2: 8px;
  --jc-space-3: 12px;
  --jc-space-4: 16px;
  --jc-space-6: 24px;
  --jc-space-8: 32px;
  --jc-space-12: 48px;
  --jc-space-16: 64px;
}
```

Typography:

- Display headings: Playfair Display
- UI and body: Poppins

Glass effects must be subtle and readable, not decorative at the expense of usability.

---

## 4.14 Sign-In and Sign-Up Need Complete Redesign

### Required customer authentication screens

- Joy Corner logo
- Premium coffee background
- Glass card
- Name
- Phone
- Optional email
- Password
- Confirm password
- Terms acknowledgement
- Loading
- Validation
- Password visibility
- Forgot password

### Security rule

Staff roles must not be publicly self-registered.

Owner, Cashier, and Barista accounts must be assigned by authorized administration.

Role authorization must be enforced on the backend.

---

## 4.15 Legacy Data Is Polluting Live Operations

### Evidence

Order IDs beginning with `LEGACY-` appear in active Cashier and Barista queues.

### Required Fix

Create a migration/archive routine:

- Mark legacy completed orders as historical
- Exclude them from active queries
- Preserve them for reporting
- Correct invalid payment values where source data allows
- Flag unresolved financial inconsistencies for owner review
- Never silently rewrite financial records without an audit log

---

## 5. Proposed Target Architecture

Assuming Firebase is already part of the project:

### Firebase Auth

- Customer authentication
- Staff authentication
- Session handling

### Firestore

- Users
- Customers
- Products
- Product variants
- Product extras
- Orders
- Payments
- Receipts
- Vouchers
- Voucher redemptions
- Loyalty ledger
- Status history
- Audit logs
- Daily closures
- Application settings

### Firebase Storage

- Product photography
- Brand assets
- Optional receipt files

### Secure backend / Cloud Functions / API

- Trusted total calculation
- State transitions
- Payment updates
- Voucher validation
- Loyalty awarding
- Receipt finalization
- Google Sheets synchronization
- End-of-day processing

### Google Sheets

Use for:

- Reporting
- Manual review
- Export
- Business summaries
- Backup views

Do not use Google Sheets as the live real-time operational database for customer, cashier, and kitchen screens.

---

## 6. Recommended Order Data Model

```json
{
  "id": "internal-id",
  "orderNumber": "JC-20260726-0007",
  "customerId": "customer-id",
  "customerSnapshot": {
    "name": "Sara Mohamed",
    "phone": "+201234567890"
  },
  "source": "CUSTOMER_APP",
  "orderPlace": "DINE_IN",
  "placeDetails": {
    "tableNumber": "4"
  },
  "items": [],
  "subtotalMinor": 24800,
  "discountMinor": 2000,
  "voucherDiscountMinor": 1000,
  "taxMinor": 1200,
  "serviceFeeMinor": 0,
  "deliveryFeeMinor": 0,
  "totalMinor": 23000,
  "amountPaidMinor": 23000,
  "remainingMinor": 0,
  "currency": "EGP",
  "paymentStatus": "PAID",
  "orderStatus": "CONFIRMED",
  "paymentMethod": "CASH",
  "notes": "Less sugar please",
  "createdAt": "server timestamp",
  "submittedAt": "server timestamp",
  "confirmedAt": "server timestamp",
  "preparationStartedAt": null,
  "readyAt": null,
  "pickedUpAt": null,
  "createdBy": "user-id",
  "confirmedBy": "cashier-id",
  "receiptId": "receipt-id",
  "businessDayId": "2026-07-26",
  "version": 1
}
```

Use integer minor units for all money values.

---

## 7. Priority Classification

## P0 — Must Fix Before Operational Use

- Correct order-state machine
- Correct payment-state calculation
- Repair Confirm action
- Prevent duplicate submissions
- Remove completed orders from active queues
- Fix barista transitions
- Real-time customer tracking
- Enforce role authorization
- Recalculate totals on backend
- Archive legacy orders from active screens

## P1 — High Priority

- Complete cashier POS
- Customer auto-fill by phone
- Structured order-place details
- Paid/unpaid filters
- Receipt consistency
- Loyalty ledger integrity
- Voucher single-use enforcement
- Responsive navigation

## P2 — Product Quality

- Joy Corner visual redesign
- Sign-in/sign-up redesign
- Product image storage
- Owner image-management screen
- Instagram-assisted image review flow
- Mobile optimization
- Accessibility improvements

## P3 — Operational Maturity

- End-to-end tests
- Audit logs
- Error monitoring
- Retry queues
- Google Sheets background sync
- Performance optimization
- Offline/reconnect handling
- Deployment checklist

---

## 8. Recommended Implementation Sequence

### Stage 1 — Repository Audit

- Map frontend, backend, auth, database, API, and deployment
- Find all order and payment status definitions
- Find all role checks
- Find all active-order queries
- Produce architecture diagram

### Stage 2 — Domain Model

- Centralize statuses
- Add transition validator
- Add schema validation
- Normalize monetary calculations
- Add status history

### Stage 3 — Backend Safety

- Trusted total calculation
- Atomic confirmation
- Idempotency
- Role authorization
- Server timestamps
- Audit logging

### Stage 4 — Operational Screens

- Cashier POS
- Cashier queue
- Barista queue
- Filters
- Completed-order archive

### Stage 5 — Customer Experience

- Customer lookup
- Customer order tracking
- Receipts
- Unpaid balances
- Rewards and vouchers

### Stage 6 — Branding and Responsive UI

- Apply design tokens
- Replace navigation
- Build reusable components
- Redesign authentication
- Optimize desktop, tablet, and mobile

### Stage 7 — Product Images

- Configure storage
- Implement owner image manager
- Add optimized image delivery
- Replace logo placeholders
- Add import/review workflow

### Stage 8 — Testing and Release

- Unit tests
- Integration tests
- End-to-end workflow
- Security-rule tests
- Production build
- Staging validation
- Data backup
- Controlled production deployment

---

## 9. Required Test Scenario

The following complete flow must pass:

```text
Customer signs in
→ Customer opens menu
→ Customer adds customized products
→ Customer submits order
→ Cashier sees new order immediately
→ Cashier enters/searches phone
→ Existing customer name is populated automatically
→ Cashier selects order place
→ Cashier records payment
→ Backend recalculates totals
→ Cashier confirms
→ Barista receives confirmed order immediately
→ Customer sees Confirmed
→ Barista starts preparation
→ Customer sees Being prepared
→ Barista marks Ready
→ Customer sees Ready for pickup
→ Barista marks Picked up
→ Order disappears from active Cashier and Barista queues
→ Receipt remains available
→ Customer history updates
→ Loyalty points are awarded exactly once
→ End-of-day totals remain consistent
```

---

## 10. Repository-Level Questions to Resolve

These require source-code inspection:

1. Which frontend framework and version are used?
2. Is the backend Express, serverless functions, Apps Script, or another service?
3. Is Firebase Auth currently the only authentication provider?
4. Is Firestore the operational database or is Google Sheets still primary?
5. Where are order totals calculated?
6. Where is payment status assigned?
7. Are order and payment states enums or arbitrary strings?
8. How are real-time updates currently implemented?
9. Which collection/table powers Cashier and Barista queues?
10. Are legacy orders loaded from Google Sheets on every request?
11. Are staff permissions enforced server-side?
12. Is the menu API payload unnecessarily large?
13. Are menu images embedded, repeated, or unoptimized?
14. Is there an existing storage bucket?
15. Are environment variables separated correctly between frontend and backend?
16. Are Firebase security rules version controlled?
17. Is there automated testing?
18. Is there a staging environment?
19. Is end-of-day reset destructive?
20. Is Google Sheets synchronization retry-safe?

---

## 11. Performance Notes

The readiness endpoint reported approximately 90 ms database latency, which is acceptable for a basic health check.

However, `/api/menu` returns approximately 69 KB. This is not necessarily excessive, but it should be reviewed for:

- Repeated image URLs
- Unused fields
- Large descriptions
- Embedded base64 data
- Duplicate products
- Unneeded variants
- Missing compression
- Lack of caching
- Lack of pagination or category filtering

Menu images should be served from optimized storage/CDN and lazy-loaded.

---

## 12. Security Concerns to Verify

- Role stored only in local storage
- Public staff sign-up
- Client-controlled totals
- Client-controlled payment status
- Client-controlled loyalty points
- Unauthenticated Apps Script endpoints
- Exposed service-account credentials
- Weak storage rules
- Missing database validation
- Missing rate limits
- Duplicate voucher redemption
- Duplicate loyalty awards
- Insecure receipt access
- Cross-customer order visibility
- Missing audit logs
- Missing idempotency

No security conclusion should be considered final until the repository and backend rules are inspected.

---

## 13. Design Assets

The new visual direction should use:

- The generated Joy Corner full app concept
- The generated Joy Corner style-guide PNG
- The official logo
- Real Joy Corner product photography
- Instagram content as brand inspiration
- Original product files for production menu images whenever available

The Instagram page should not be scraped as a permanent image backend.

Imported images should be reviewed, approved, and copied into permanent application storage.

---

## 14. Definition of Done

The application is not complete until:

- All action buttons work
- All role permissions are enforced
- Order transitions are valid
- Payment totals are consistent
- Customer name auto-fill works
- Active queues contain only active orders
- Completed orders move to history
- Customer tracking updates in real time
- Loyalty points are awarded once
- Vouchers are redeemed once
- Receipts match payment records
- Product images are stored correctly
- Navigation works on mobile and desktop
- Joy Corner identity is consistent
- Linting passes
- Type checking passes
- Automated tests pass
- Production build passes
- Staging end-to-end testing passes
- Deployment and rollback steps are documented

---

## 15. Audit Limitation

This report is based on visual evidence and the endpoint checks supplied by the project owner.

It is a strong product and workflow audit, but it is not yet a source-code audit.

OpenCode or Codex must now inspect the repository and replace assumptions with exact references to:

- Files
- Functions
- Components
- API handlers
- Collections/tables
- Security rules
- Environment variables
- Failing tests
- Root causes
- Implemented fixes

The repository-level version of this report should include file paths, line references, confirmed root causes, and commit IDs.
