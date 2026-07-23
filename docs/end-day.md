# End Day

Manual End Day is owner-only.

The backend:

- computes the current business date
- rejects duplicate closure with HTTP `409` when Day History already contains the date
- appends Day History summary
- marks same-day order rows as archived
- writes an audit event
- preserves customers, unpaid balances, lifetime totals, loyalty history, reward history, and payment history

Only temporary daily operational state should be reset. If archive writes fail, reset fails.

Automatic scheduled close and full restore tooling require a scheduler/runtime decision and are tracked in future development planning.
