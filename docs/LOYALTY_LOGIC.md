# Loyalty logic

The eligible-drink threshold comes from `Business Settings.loyaltyThreshold` and defaults safely to 5. Only completed, paid, loyalty-eligible menu purchases count. Cancelled/rejected orders and free/reward lines do not count.

Balance is calculated as earned rewards minus consumed or reserved rewards:

- Generating a voucher reserves one available reward immediately.
- Redeeming it consumes the reservation and appends a redemption record.
- Cancelling or expiring an unused voucher releases the reservation.
- A redeemed/cancelled/expired code cannot be redeemed again.

Voucher codes use cryptographically secure random bytes, collision checks, the format `JC-VCH-YYYYMMDD-XXXXXX`, and an internal QR payload.
