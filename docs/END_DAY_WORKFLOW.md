# End Day Workflow

End Day is owner-only and keyed by the Cairo business date. The backend rejects
concurrent attempts, derives the day from canonical Orders, Payments, Order
Items, and Redeemed loyalty rows, generates the receipt PDF, then writes typed
`Daily Receipt File` and `End Day Archive` events to System Log. Finally it marks
the day's master Orders archived with the archive batch ID.

A completed date returns its existing archive metadata rather than creating a
second closure. The workflow never deletes customers, payments, items, loyalty
records, or history, and never changes financial totals. The System Log JSON
payload retains the complete day summary and file metadata.

Before production use, verify Firebase Storage access, Cairo date boundaries,
sales/payment reconciliation, event uniqueness, PDF retrieval, and a repeated
request for the same date. A duplicate financial/event result is a rollback
condition.
