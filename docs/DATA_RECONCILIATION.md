# Data Reconciliation

Live verification of the rebuilt working copy completed on 2026-07-18.

| Tab         | Data rows |
| ----------- | --------: |
| Dashboard   |        19 |
| Settings    |        18 |
| Staff       |         4 |
| Menu        |       180 |
| Customers   |        12 |
| Orders      |       575 |
| Order Items |       603 |
| Payments    |        80 |
| Loyalty     |        25 |
| System Log  |       173 |

All ten headers and row counts matched the in-memory migration output. Sales
reconciled at EGP 11,358 with a zero difference. Applied payment transactions
reconciled at EGP 11,158 with a zero difference. There are zero duplicate order
IDs, zero duplicate order client request IDs, and zero orphan order items.

There are 67 preserved payment transactions without a provable order ID. They
are logged exceptions and are included in the payment total. Order-level paid
allocation is therefore not expected to equal the payment ledger until those
exceptions are reviewed. Customer aggregates were recalculated from canonical
orders/items rather than copied from stale formulas.
