# Payment Model

Payments are immutable transactions. `amountReceived` is tender supplied,
`amountApplied` is the amount allocated to the order, and `changeAmount` is
cash returned. Their invariant is:

`amountReceived = amountApplied + changeAmount`

Order payment status is derived from applied totals: Unpaid at zero, Partial
below the order total, and Paid at the total. Non-cash tender cannot exceed the
remaining amount. The backend, not the client, calculates allocations and
change. Each offline payment has a client request ID and deterministic server
payment ID so replay cannot create a second transaction.

Legacy orphan payments stay in the Payments ledger with an exception record;
they are never assigned to an order without evidence.
