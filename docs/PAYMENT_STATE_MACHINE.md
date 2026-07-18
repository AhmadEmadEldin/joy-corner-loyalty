# Payment state machine

Payment status is `Unpaid`, `Partial`, `Paid`, `Refunded`, or `Voided`. It is calculated from the order total and append-only payment records; changing order preparation state never marks an order paid.

Collection requires an authorized cashier/manager/owner action and an idempotency key. The server records amount received, amount applied, change, method, receiver UID/name, and timestamp, then updates paid, remaining, and outstanding amounts on the master order. Overpayment is returned as change and is not counted as revenue. Refund and void are terminal financial states and require an audited privileged workflow.
