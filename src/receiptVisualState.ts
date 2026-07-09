export type PreparationStatus =
  | "Submitted"
  | "Accepted"
  | "Preparing"
  | "Ready"
  | "Picked Up"
  | "Cancelled";

export type PaymentStatus =
  | "Awaiting Payment"
  | "Partially Paid"
  | "Paid"
  | "Unpaid"
  | "Refunded";

const preparationStatusMap: Record<string, PreparationStatus> = {
  accepted: "Accepted",
  cancelled: "Cancelled",
  canceled: "Cancelled",
  done: "Picked Up",
  open: "Submitted",
  pickedup: "Picked Up",
  pickup: "Picked Up",
  preparing: "Preparing",
  ready: "Ready",
  requested: "Submitted",
  served: "Picked Up",
  submitted: "Submitted",
};

const paymentStatusMap: Record<string, PaymentStatus> = {
  awaiting: "Awaiting Payment",
  awaitingpayment: "Awaiting Payment",
  partial: "Partially Paid",
  partiallypaid: "Partially Paid",
  paid: "Paid",
  refunded: "Refunded",
  unpaid: "Unpaid",
};

export const preparationStatusStyles: Record<PreparationStatus, string> = {
  Submitted: "status-submitted",
  Accepted: "status-accepted",
  Preparing: "status-preparing",
  Ready: "status-ready",
  "Picked Up": "status-picked-up",
  Cancelled: "status-cancelled",
};

export const paymentStatusStyles: Record<PaymentStatus, string> = {
  "Awaiting Payment": "payment-awaiting",
  "Partially Paid": "payment-partial",
  Paid: "payment-paid",
  Unpaid: "payment-unpaid",
  Refunded: "payment-refunded",
};

function statusKey(value: unknown) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[-_\s]+/g, "");
}

export function normalizePreparationStatus(value: unknown): PreparationStatus {
  return preparationStatusMap[statusKey(value)] || "Submitted";
}

export function normalizePaymentStatusForDisplay(
  value: unknown,
): PaymentStatus {
  return paymentStatusMap[statusKey(value)] || "Awaiting Payment";
}

export function getPreparationStatusClass(value: unknown) {
  return preparationStatusStyles[normalizePreparationStatus(value)];
}

export function getPaymentStatusClass(value: unknown) {
  return paymentStatusStyles[normalizePaymentStatusForDisplay(value)];
}

export function isPickedUpStatus(value: unknown) {
  return normalizePreparationStatus(value) === "Picked Up";
}

export function isFinishedPreparationStatus(value: unknown) {
  return normalizePreparationStatus(value) === "Ready";
}
