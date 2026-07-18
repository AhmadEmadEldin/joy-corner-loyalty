export type VoucherStatus = "Reserved" | "Redeemed" | "Cancelled" | "Expired";

export function normalizeVoucherStatus(value: unknown): VoucherStatus {
  const status = String(value || "")
    .trim()
    .toLowerCase();
  if (status === "redeemed") return "Redeemed";
  if (status === "cancelled" || status === "canceled") return "Cancelled";
  if (status === "expired") return "Expired";
  return "Reserved";
}

export function canRedeemVoucher(value: unknown) {
  return normalizeVoucherStatus(value) === "Reserved";
}
