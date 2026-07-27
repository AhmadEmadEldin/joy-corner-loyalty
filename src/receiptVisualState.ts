export type PreparationStatus =
  | "draft"
  | "submitted"
  | "awaiting_confirmation"
  | "confirmed"
  | "in_preparation"
  | "ready"
  | "picked_up"
  | "cancelled"
  | "rejected";

export type PaymentStatus =
  | "Awaiting Payment"
  | "Partially Paid"
  | "Paid"
  | "Unpaid"
  | "Refunded";

const preparationStatusMap: Record<string, PreparationStatus> = {
  awaitingconfirmation: "awaiting_confirmation",
  cancelled: "cancelled",
  confirmed: "confirmed",
  draft: "draft",
  inpreparation: "in_preparation",
  pickedup: "picked_up",
  ready: "ready",
  rejected: "rejected",
  submitted: "submitted",
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
  awaiting_confirmation: "status-awaiting-confirmation",
  cancelled: "status-cancelled",
  confirmed: "status-confirmed",
  draft: "status-draft",
  in_preparation: "status-in-preparation",
  picked_up: "status-picked-up",
  ready: "status-ready",
  rejected: "status-rejected",
  submitted: "status-submitted",
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
  return preparationStatusMap[statusKey(value)] || "awaiting_confirmation";
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
  return normalizePreparationStatus(value) === "picked_up";
}

export function isFinishedPreparationStatus(value: unknown) {
  return normalizePreparationStatus(value) === "ready";
}
