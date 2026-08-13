# Joy Corner Loyalty — Business Requirements Document

| Document field | Value |
| --- | --- |
| Product | Joy Corner Loyalty |
| Document type | Business Requirements Document (BRD) |
| Version | 1.0 |
| Status | Draft for stakeholder approval |
| Owner | Joy Corner |
| Last updated | 13 August 2026 |

## 1. Executive summary

Joy Corner Loyalty is a web application for customer ordering, loyalty, cashier operations, barista preparation, receipts, payment recording, menu management, and owner reporting.

The product must provide one reliable order record from selection through pickup. When an authorized employee changes an item, size, quantity, modifier, note, or price before preparation, the corrected order must replace the previous information across the customer portal, cashier queue, barista queue, owner views, printed documents, and reporting. Totals must be recalculated by the server and all affected users must receive the new version without relying on stale browser state.

This BRD defines the required workflows, controls, analytics, responsive behavior, performance expectations, and acceptance criteria for the production application.

## 2. Business context

Joy Corner needs a lightweight operational system that helps customers order ahead while enabling staff to review, correct, confirm, prepare, collect payment, and complete orders accurately.

The current technical baseline is:

- React customer and staff portals.
- Express API and server-side authorization.
- Neon PostgreSQL as the durable source of truth.
- Server-Sent Events (SSE) for live application updates.
- Northflank for the production service.
- Google Sheets as an asynchronous reporting destination only.

Google Sheets must not be queried during customer or staff operations.

## 3. Business objectives

1. Eliminate stale or contradictory order information.
2. Ensure every order edit produces an accurate recalculated receipt.
3. Ensure the barista always receives the latest confirmed preparation instructions.
4. Make the pre-confirmation receipt compact and readable on phones, tablets, and desktops.
5. Inform customers when staff change their orders and record customer approval where required.
6. Provide owners with trustworthy product, revenue, demand, and operational analysis.
7. Reduce delays caused by unnecessary rendering, duplicate requests, heavy assets, or inefficient database queries.
8. Maintain secure role-based access and a complete audit history.

## 4. Success measures

| Measure | Target |
| --- | --- |
| Stale product details after a successful edit | 0 incidents |
| Incorrect totals after an edit | 0 incidents |
| Printed receipts using an old order version | 0 incidents |
| Barista tickets using an old confirmed version | 0 incidents |
| Horizontal page overflow at supported widths | 0 affected primary workflows |
| Staff edits with an audit record | 100% |
| Analytics totals reconciling with valid completed orders | 100% |
| Duplicate order creation from repeated submission | 0 incidents |

## 5. Stakeholders and user roles

### 5.1 Customer

The customer browses the menu, selects sizes and modifiers, reviews a receipt, submits an order, monitors changes and preparation, receives notifications, and accesses rewards and vouchers.

### 5.2 Cashier

The cashier reviews pending orders, corrects items with the customer, confirms the final order, records payments, and prints customer receipts.

### 5.3 Waiter

The waiter creates or follows permitted service orders without access to restricted owner or financial functions.

### 5.4 Barista

The barista receives only confirmed preparation work, reads the latest item details, and advances the order through preparation states.

### 5.5 Manager

The manager supervises staff workflows, corrects eligible orders, reviews operational information, and handles permitted exceptions.

### 5.6 Owner

The owner manages the menu, orders, receipts, payments, customers, vouchers, reports, analytics, and controlled overrides.

## 6. Scope

### 6.1 In scope

- Customer authentication and profile.
- Menu discovery, search, and categories.
- Product customization with Small, Medium, and Large or other configured sizes.
- Cart and pre-confirmation receipt.
- Customer checkout and order submission.
- Staff order creation, correction, confirmation, and payment recording.
- Barista preparation workflow.
- Customer and staff realtime synchronization.
- Digital and printed receipts.
- Barista preparation tickets.
- Product and operational analytics for the owner.
- Responsive layouts for phone, tablet, laptop, and desktop.
- Performance, reliability, permissions, and audit controls.

### 6.2 Out of scope for this version

- Online card processing inside the web application.
- Delivery fleet routing.
- Inventory purchasing and supplier management.
- Multi-branch stock transfers.
- Replacing Neon with Google Sheets or another live database.
- Converting the project into a Canva application.

## 7. Core business rules

| ID | Rule |
| --- | --- |
| BR-001 | Neon PostgreSQL is the authoritative source for orders, prices, payments, and reporting facts. |
| BR-002 | The browser must never be trusted as the authority for price calculations. |
| BR-003 | Only an owner, manager, or cashier may edit an eligible submitted order. |
| BR-004 | A barista may change preparation status but may not change financial details. |
| BR-005 | A customer may access only orders associated with that customer account. |
| BR-006 | Normal order editing ends when preparation begins. Any later correction requires an explicit owner-controlled exception and audit record. |
| BR-007 | An edit that reduces the total below the valid amount already paid must be rejected or handled through a controlled refund process. |
| BR-008 | Cancelled, rejected, archived-invalid, voided, or removed items must not count as valid product sales. |
| BR-009 | Printed documents must be generated from the latest order version returned by the API. |
| BR-010 | A confirmed order sent to preparation must contain the latest committed item details. |
| BR-011 | Every staff edit must record the actor, time, reason, previous values, updated values, and resulting totals. |
| BR-012 | A material price increase must not be applied silently; customer communication and acceptance must be recorded where required. |

## 8. Functional requirements

### 8.1 Customer menu and product customization

| ID | Requirement |
| --- | --- |
| FR-MENU-001 | The system must display only customer-orderable menu items and their currently valid sizes and modifiers. |
| FR-MENU-002 | Selecting a new product must initialize that product's own default size, modifiers, quantity, and notes. Values from a previously opened product must not remain. |
| FR-MENU-003 | Editing a cart line must load the saved item, size, quantity, modifiers, and notes for that exact line. |
| FR-MENU-004 | The customer must be able to select a configured size such as Small, Medium, or Large. |
| FR-MENU-005 | The displayed line total must update when size, modifiers, or quantity changes. |
| FR-MENU-006 | Unavailable products or sizes must not be submitable. |
| FR-MENU-007 | Repeated clicks on Add or Update must not create duplicate cart lines unintentionally. |

### 8.2 Cart and receipt review before confirmation

| ID | Requirement |
| --- | --- |
| FR-REC-001 | The review screen must show quantity, product name, size, modifiers, preparation note, unit price where applicable, line total, and an Edit action for every line. |
| FR-REC-002 | Item information must be divided into readable rows or labels rather than one crowded sentence. |
| FR-REC-003 | The customer must be able to edit an item directly from receipt review without losing checkout information already entered. |
| FR-REC-004 | The final confirmation step must repeat the complete order and calculated total before submission. |
| FR-REC-005 | Returning to an earlier checkout step must preserve voucher selection, payment method, pickup details, and order notes. |
| FR-REC-006 | The receipt must recalculate immediately after a cart edit. |
| FR-REC-007 | The receipt layout must not clip product names, notes, prices, or actions at supported viewport widths. |

### 8.3 Submitted order editing

| ID | Requirement |
| --- | --- |
| FR-EDIT-001 | Authorized staff must be able to change product, size, quantity, modifiers, and preparation notes before preparation begins. |
| FR-EDIT-002 | Authorized staff must be able to add or remove eligible lines while ensuring at least one valid item remains unless the order is cancelled. |
| FR-EDIT-003 | Replacement controls must group sizes under their product so staff can distinguish Small, Medium, and Large clearly. |
| FR-EDIT-004 | The API must validate the replacement product, size, availability, modifier ownership, and quantity. |
| FR-EDIT-005 | The edit must update the product reference, item name snapshot, category snapshot, size name, unit price, modifiers, notes, quantity, modifier total, and line total. |
| FR-EDIT-006 | The edit and all recalculations must run in one database transaction with the order locked against conflicting edits. |
| FR-EDIT-007 | The API response must return the new authoritative order version or sufficient information for an immediate authoritative refresh. |
| FR-EDIT-008 | The interface must show a busy state and prevent repeated edit submission until the request finishes. |
| FR-EDIT-009 | A failed edit must leave the original order unchanged and display an actionable error. |

### 8.4 Server-side receipt calculation

The server must use validated database prices and calculate:

```text
Line total = (size unit price + valid modifier prices) × quantity

Subtotal = sum of active line totals

Final total = subtotal − order discount − voucher discount + tax

Remaining amount = final total − valid non-voided payments
```

| ID | Requirement |
| --- | --- |
| FR-CALC-001 | Every order edit must recalculate the affected line and the full order totals. |
| FR-CALC-002 | Voucher eligibility and discount values must be revalidated when an edit changes applicable products or totals. |
| FR-CALC-003 | Payment status must be recalculated as unpaid, partially paid, or paid. |
| FR-CALC-004 | Monetary calculations must use consistent rounding at currency precision. |
| FR-CALC-005 | The customer, cashier, owner, and printed receipt must display the same final total. |

### 8.5 System-wide synchronization

| ID | Requirement |
| --- | --- |
| FR-SYNC-001 | A successful edit must publish a realtime event after the database transaction commits. |
| FR-SYNC-002 | The customer order page and digital receipt must refresh to the updated order. |
| FR-SYNC-003 | The cashier, owner, manager, and relevant waiter views must refresh to the updated order. |
| FR-SYNC-004 | The barista or kitchen queue must receive the updated preparation information if the order is eligible for that queue. |
| FR-SYNC-005 | Old product names, sizes, modifiers, notes, quantities, and totals must disappear from active views after synchronization. |
| FR-SYNC-006 | Duplicate realtime events must not trigger uncontrolled duplicate requests or visible flicker. |
| FR-SYNC-007 | A browser reconnecting after network loss must load the newest server state. |

### 8.6 Customer communication and acceptance

When staff speak with a customer and change the order, the system must make the change visible to that customer.

| ID | Requirement |
| --- | --- |
| FR-CUST-001 | The updated order must display an “Updated by staff” indicator and update time. |
| FR-CUST-002 | The customer must receive an in-app notification describing the changed order and revised total. |
| FR-CUST-003 | The customer view must show a concise before-and-after summary for material changes. |
| FR-CUST-004 | Staff must be able to record “Customer informed”, “Customer accepted”, or “Customer declined” when the business workflow requires approval. |
| FR-CUST-005 | If the revised total is higher, the interface must show the additional amount due. |
| FR-CUST-006 | If the revised total is lower, the interface must show the revised remaining balance. |
| FR-CUST-007 | An order requiring customer acceptance must not proceed to preparation until acceptance is recorded. |
| FR-CUST-008 | Customer acceptance status and the responsible staff member must be audited. |

### 8.7 Cashier confirmation and barista handoff

| ID | Requirement |
| --- | --- |
| FR-HAND-001 | The cashier must review the latest server version before confirming an order. |
| FR-HAND-002 | Confirmation must send the corrected product, size, quantity, modifiers, and notes to the barista queue. |
| FR-HAND-003 | The barista must not receive an unconfirmed customer order. |
| FR-HAND-004 | If an eligible edit occurs after cashier confirmation but before barista acceptance, the barista ticket must refresh and show an update indicator. |
| FR-HAND-005 | Barista actions must operate on the current order version and reject invalid stale transitions. |

### 8.8 Digital receipt, customer print, and barista ticket

| ID | Requirement |
| --- | --- |
| FR-PRINT-001 | Before printing, the application must fetch the latest order from the API rather than printing stale queue state. |
| FR-PRINT-002 | The customer receipt must show order number, pickup name, time, current items, sizes, quantities, modifiers, notes, line totals, subtotal, discounts, voucher, tax, payments, remaining amount, final total, and payment method. |
| FR-PRINT-003 | An edited receipt must show a clear updated-order indicator and latest update time. |
| FR-PRINT-004 | The barista ticket must emphasize order number, pickup name, item, size, quantity, modifiers, preparation notes, service location, and latest update time. |
| FR-PRINT-005 | Barista tickets must not show prices unless Joy Corner explicitly enables them. |
| FR-PRINT-006 | Print styles must support common 58 mm and 80 mm thermal formats and standard browser printing. |
| FR-PRINT-007 | Long names and notes must wrap without overlapping quantities or totals. |

### 8.9 Owner product analytics

All analytics must use server-side aggregation over valid order data.

| ID | Requirement |
| --- | --- |
| FR-AN-001 | The owner must see units sold per product. |
| FR-AN-002 | The owner must see gross and net product revenue using clearly documented definitions. |
| FR-AN-003 | The owner must see the number of distinct valid orders containing each product. |
| FR-AN-004 | The owner must see average quantity per order, best-selling size, and most-used modifier per product. |
| FR-AN-005 | The owner must see sales by category, hour, day, week, and month. |
| FR-AN-006 | The owner must compare a selected period with its previous equivalent period. |
| FR-AN-007 | Products must be classified as rising, stable, or falling using a visible calculation rule. |
| FR-AN-008 | The owner must see products frequently removed or replaced before confirmation. |
| FR-AN-009 | Filters must include Today, Yesterday, Last 7 Days, Last 30 Days, This Month, Previous Month, and Custom Range. |
| FR-AN-010 | Cancelled, rejected, removed, voided, and otherwise invalid sales must be excluded. |

### 8.10 Owner analysis dashboard

| ID | Requirement |
| --- | --- |
| FR-OWN-001 | The dashboard must identify the best-selling product by valid units sold. |
| FR-OWN-002 | The dashboard must identify the highest-revenue product. |
| FR-OWN-003 | The dashboard must show most improved and most declined products for comparable periods. |
| FR-OWN-004 | The dashboard must show peak ordering times, average order value, preparation time, cancellation rate, rejection rate, staff-edited order rate, unpaid balance, and repeat-customer rate. |
| FR-OWN-005 | Every insight must show or inherit a visible date range. |
| FR-OWN-006 | Narrative insights must be derived from actual values and must not present unsupported assumptions as facts. |
| FR-OWN-007 | Recommendations must be labeled separately from calculated observations. |

## 9. Analytics definitions

| Metric | Definition |
| --- | --- |
| Units sold | Sum of final item quantities on valid included orders. |
| Product revenue | Sum of final line totals, with the dashboard clearly identifying whether allocated order-level discounts are included. |
| Orders containing product | Count of distinct valid orders containing at least one final line for the product. |
| Best-selling product | Product with the highest valid units sold in the selected period. |
| Highest-revenue product | Product with the highest defined product revenue in the selected period. |
| Average order value | Valid order revenue divided by count of valid orders in the period. |
| Staff-edited order rate | Valid submitted orders with at least one staff item edit divided by valid submitted orders. |
| Repeat-customer rate | Identified customers with more than one qualifying completed order divided by identified customers with a qualifying order. |
| Cancellation rate | Cancelled orders divided by submitted orders for the selected period. |
| Preparation time | Time from barista acceptance or preparation start to Ready, using one consistently documented definition. |
| Product replacement rate | Number of submitted item lines replaced before preparation divided by submitted item lines. |

## 10. Non-functional requirements

### 10.1 Performance

| ID | Requirement |
| --- | --- |
| NFR-PERF-001 | Primary controls must provide immediate visual feedback. |
| NFR-PERF-002 | Operations taking longer than approximately 300 ms must show a loading or busy state. |
| NFR-PERF-003 | Search input must remain responsive and avoid unnecessary full-list work. |
| NFR-PERF-004 | Large owner tables must use pagination or controlled incremental loading. |
| NFR-PERF-005 | Reports must use database aggregation and appropriate indexes rather than loading all orders into the browser. |
| NFR-PERF-006 | Heavy role-specific functionality should be loaded only when needed. |
| NFR-PERF-007 | Menu images must be optimized, correctly sized, and lazy-loaded where appropriate. |
| NFR-PERF-008 | Realtime refreshes must be debounced or deduplicated safely. |

### 10.2 Responsive design

The primary workflows must be verified at 320, 375, 390, 430, 768, 1024, 1280, and 1440 pixels or wider.

| ID | Requirement |
| --- | --- |
| NFR-RESP-001 | Primary pages must not create horizontal viewport overflow. |
| NFR-RESP-002 | Fixed controls must respect mobile safe areas and must not overlap final checkout actions. |
| NFR-RESP-003 | Dialogs must remain scrollable in portrait and landscape orientations. |
| NFR-RESP-004 | Receipt text must wrap without separating a price from its context or hiding an Edit action. |
| NFR-RESP-005 | Touch targets should be at least approximately 44 by 44 pixels on phones. |
| NFR-RESP-006 | Receipt spacing and typography should be compact, but accessibility and touch usability must be preserved. |
| NFR-RESP-007 | Large tables must convert into readable cards or controlled horizontal tables on narrow screens. |

### 10.3 Reliability and data integrity

| ID | Requirement |
| --- | --- |
| NFR-REL-001 | Order edits must be atomic database transactions. |
| NFR-REL-002 | Concurrent edits must be serialized or rejected safely using row locking or version checks. |
| NFR-REL-003 | An idempotency mechanism must prevent duplicate customer order creation. |
| NFR-REL-004 | A committed update must publish realtime events only after the transaction succeeds. |
| NFR-REL-005 | A reconnect or page refresh must recover the authoritative server state. |

### 10.4 Security and privacy

| ID | Requirement |
| --- | --- |
| NFR-SEC-001 | The backend must enforce authentication and role permissions for every protected operation. |
| NFR-SEC-002 | Customer ownership must be validated before returning an order, receipt, voucher, or notification. |
| NFR-SEC-003 | Client-supplied prices and totals must be ignored as authoritative values. |
| NFR-SEC-004 | Audit records must not expose secrets or unnecessary personal data. |
| NFR-SEC-005 | Production secrets must remain outside the repository. |

### 10.5 Accessibility

| ID | Requirement |
| --- | --- |
| NFR-A11Y-001 | Interactive controls must have accessible names. |
| NFR-A11Y-002 | Dialogs must manage focus, support Escape where safe, and trap focus appropriately. |
| NFR-A11Y-003 | Keyboard users must be able to complete primary customer and staff workflows. |
| NFR-A11Y-004 | Status and error changes must be announced appropriately. |
| NFR-A11Y-005 | Text and control contrast must remain readable across supported states. |

## 11. Primary workflow

1. Customer selects a menu item.
2. Customer chooses size, modifiers, notes, and quantity.
3. Customer adds the configured line to the cart.
4. Customer reviews and may edit the compact receipt.
5. Customer confirms pickup, voucher, and payment intention.
6. Server validates the order and stores authoritative prices and snapshots.
7. Cashier receives the pending order.
8. If the customer calls or speaks with staff, authorized staff edit the order.
9. Server recalculates all totals, writes the audit history, and publishes the updated version.
10. Customer sees the change and revised amount; acceptance is recorded if required.
11. Cashier confirms the latest order.
12. Barista receives the latest confirmed preparation ticket.
13. Barista progresses the order through preparation and Ready.
14. Staff record payment and pickup as permitted.
15. The completed valid order contributes to owner analytics and asynchronous reporting.

## 12. Acceptance criteria

### 12.1 Item replacement scenario

Given an order contains a Medium Latte, when an authorized cashier replaces it with a Large Cappuccino before preparation, then:

- The database stores Cappuccino as the product and Large as the size.
- The previous Latte wording no longer appears in active order views.
- The line and order totals use the validated Large Cappuccino price.
- The cashier sees the new order.
- The customer sees the new order and revised total.
- The owner view shows the new order.
- The barista receives Large Cappuccino after confirmation.
- Customer and barista print output uses Large Cappuccino.
- The edit audit includes before and after values.
- Completed-order analytics count Cappuccino, not Latte.

### 12.2 Customer-informed scenario

Given staff change an order after discussing it with the customer, when the cashier records “Customer accepted”, then the customer order shows the staff update, the new total, the update time, and the acceptance state, and the order may proceed to confirmation.

### 12.3 Recalculation scenario

Given an order has a voucher and a partial payment, when an item is changed, then the server revalidates the voucher, recalculates subtotal and final total, preserves valid payments, calculates the remaining amount, and blocks any unsupported reduction below the paid amount.

### 12.4 Responsive receipt scenario

Given the receipt is opened at each supported viewport, then all item details and actions remain readable, the page has no horizontal overflow, fixed navigation does not cover confirmation controls, and touch targets remain usable.

### 12.5 Analytics scenario

Given completed, cancelled, rejected, and edited orders exist, when the owner selects a date range, then product counts use final valid completed lines, exclude invalid orders and removed lines, and reconcile with the underlying order records.

## 13. Test requirements

Automated and end-to-end coverage must include:

- New product state does not inherit an old product's size or notes.
- Size-only edit.
- Product replacement.
- Quantity increase and decrease.
- Modifier addition and removal.
- Preparation-note edit.
- Item addition and removal.
- Voucher revalidation.
- Partial-payment recalculation.
- Rejection of an edit below the valid paid amount.
- Transaction rollback on failure.
- Permission enforcement for every role.
- Customer notification and refreshed digital receipt.
- Barista queue and ticket refresh.
- Latest-data print generation.
- Best-seller aggregation and excluded-order rules.
- Realtime event deduplication and reconnect behavior.
- Phone, tablet, laptop, and desktop receipt layouts.
- Production build and protected-route behavior.

Required quality gates are TypeScript validation, lint, unit tests, API or integration tests, production build, and desktop/mobile end-to-end tests.

## 14. Reporting and reconciliation

- Neon is the reporting source of truth.
- Google Sheets receives asynchronous reporting exports.
- Reporting failures must not block live ordering.
- Failed exports must be retryable and observable.
- Owner dashboard totals and exported reporting totals must use the same documented inclusion rules.
- Daily reconciliation must identify differences in order count, item quantity, payments, refunds, and revenue.

## 15. Rollout approach

### Phase 1 — Data consistency

Fix order editing, recalculation, transactions, audit history, and system-wide synchronization.

### Phase 2 — Receipt and printing

Complete the compact pre-confirmation receipt, customer receipt, thermal print styles, and barista ticket refresh.

### Phase 3 — Customer acknowledgment

Add staff-change history, customer notifications, price-difference communication, and acceptance state.

### Phase 4 — Owner analytics

Add indexed server-side metrics, date filters, comparisons, product trends, and evidence-based owner insights.

### Phase 5 — Performance and responsive hardening

Profile the application, reduce duplicate work, optimize assets, paginate large views, and verify supported viewports.

### Phase 6 — Production verification

Run all quality gates, deploy through the existing GitHub-to-Northflank workflow, verify health and readiness, and perform a controlled production smoke test.

## 16. Dependencies and assumptions

- Menu products, sizes, and modifiers are maintained accurately.
- Neon is available and migrations run successfully.
- Northflank production environment variables are configured.
- The application runs one instance while using in-process SSE fan-out, unless realtime infrastructure is redesigned.
- Joy Corner will approve the exact rule for when customer acceptance is mandatory.
- Joy Corner will confirm whether barista tickets ever require prices.
- Joy Corner will approve analytics discount-allocation definitions before financial reporting is finalized.

## 17. Risks and controls

| Risk | Control |
| --- | --- |
| Concurrent staff edits overwrite each other | Row locking, version checks, and clear conflict responses. |
| Customer and barista see different order versions | One server source, post-commit realtime events, and authoritative refresh. |
| Price manipulation from the browser | Server validation of menu references and database prices. |
| Printed receipt is stale | Fetch latest order immediately before print generation. |
| Analytics count cancelled or replaced products | Centralized inclusion rules and reconciliation tests. |
| Realtime events cause request storms | Debounce, deduplicate, and scope events by topic and entity. |
| Compact mobile design becomes inaccessible | Preserve readable type, wrapping, contrast, and touch-target sizes. |
| Reporting integration disrupts live service | Keep Google Sheets asynchronous and non-authoritative. |

## 18. Open decisions

1. Is customer acceptance mandatory for every staff replacement, or only when the total increases?
2. May a manager edit after barista acceptance, or must only the owner use an override?
3. Should a lower revised total automatically create customer credit, require a refund, or only adjust an unpaid balance?
4. Which preparation stations require separate tickets?
5. Should owner product revenue allocate order-level discounts proportionally across item lines?
6. What percentage change defines rising, stable, and falling products?
7. What exact service-level target should be used for cashier-to-barista update visibility?

## 19. Definition of done

A requirement is complete only when:

- Its business rule and UI behavior are implemented.
- Server authorization and validation are enforced.
- Database changes have an inspected migration where required.
- Automated tests cover success, failure, and relevant permissions.
- Phone, tablet, and desktop behavior is verified.
- Receipts, realtime consumers, print output, and analytics use the same authoritative data.
- All repository quality gates pass.
- Production deployment and health checks succeed when deployment is authorized.
