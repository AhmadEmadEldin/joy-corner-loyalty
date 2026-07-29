# Order Workflow

The single shared workflow is `src/orderWorkflow.ts`.

```text
DRAFT
  → SUBMITTED
  → AWAITING_CONFIRMATION
  → CONFIRMED
  → IN_PREPARATION
  → READY
  → PICKED_UP
```

Cancellation is allowed only from active states. Rejection is allowed only from `AWAITING_CONFIRMATION`. Terminal states do not transition.

## Role ownership

- Customer/staff order creation records draft, submitted, and awaiting-confirmation history.
- Cashier/owner/manager confirms or rejects.
- Barista/owner/manager starts preparation, marks ready, and marks picked up.
- Payment is cashier/owner/manager only.
- Barista receives no payment or End-of-Day controls.

## Confirmation protections

Confirmation:

1. Authenticates the current account and reloads its role.
2. Locks the current order.
3. Validates the requested transition.
4. Validates cashier role ownership.
5. Reloads every product and selected size.
6. Rejects changed prices or unavailable products.
7. Updates status and confirmation projection.
8. Writes structured status history, customer notification, audit log, and reporting outbox.
9. Publishes cashier/kitchen/customer realtime topics.

The locked current state prevents duplicate confirmation. UI actions disable while saving.

Customer and staff order creation both send a client-stable idempotency key.
The key is replaced only after a successful response, so a network retry
returns the original order instead of creating a second order.

## Payment status

Payment is independent from order lifecycle:

- paid minor units `<= 0`: `UNPAID`
- paid minor units between zero and total: `PARTIALLY_PAID`
- paid minor units at least total: `PAID`
- administrative states: `REFUNDED`, `VOIDED`

The server rejects overpayment and requires a unique idempotency key.

## Completion

Picked-up orders leave active cashier and kitchen projections immediately but remain in history. A fully paid customer order first inserts its unique immutable ledger entry and only then updates the rewards projection; an existing ledger entry cannot increment the balance again. Unpaid picked-up orders remain visible in customer unpaid receipts and financial reporting.

