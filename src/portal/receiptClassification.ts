type ReceiptLike = {
  payment_status?: string | null;
  remaining_amount?: number | null;
  status?: string | null;
};

export function isCancelledReceipt(order: ReceiptLike): boolean {
  return order.status === "cancelled" || order.status === "rejected";
}

export function isOutstandingReceipt(order: ReceiptLike): boolean {
  if (isCancelledReceipt(order)) return false;
  if (typeof order.remaining_amount === "number") {
    return order.remaining_amount > 0.009;
  }
  return order.payment_status !== "paid";
}
