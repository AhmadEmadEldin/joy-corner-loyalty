# End Day workflow

End Day is owner-only and keyed by Cairo business date. An in-process lock rejects concurrent attempts. The backend calculates the day summary, creates the receipt archive/PDF record, writes one `Day History` row and one `Daily Receipt Files` row, then marks the day’s master orders archived with batch/file metadata.

It does not delete customers, payments, items, vouchers, redemptions, or loyalty history, and it does not replace the operational order status with an archive label. A retry for a completed business date returns its existing archive metadata without writing a second batch; only a concurrent in-progress attempt receives HTTP 409.

Before production use, verify service-account storage access, Cairo date, receipt totals, payment reconciliation, and the absence of an existing completed row for that date.
