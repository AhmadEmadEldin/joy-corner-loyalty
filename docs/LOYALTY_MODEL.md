# Loyalty Model

Loyalty is a single append-oriented typed ledger. `recordType` distinguishes
Voucher, Redeemed, Manual Adjustment, and future earned/reserved/cancelled
events. Voucher identity uses `relatedVoucherCode`; redemption creates a new
record instead of overwriting history, while the voucher status is updated.

Rewards are calculated from eligible paid items and reserved/redeemed voucher
records. A voucher can be redeemed only from an available status. Staff actor,
customer snapshot, related order/voucher, timestamps, and notes make every
movement traceable. Opening balances from legacy data are explicit records, not
invented orders.
