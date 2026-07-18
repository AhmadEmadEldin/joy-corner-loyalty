export type PreparationStatus =
  | "Requested"
  | "Awaiting Confirmation"
  | "Confirmed"
  | "Approved"
  | "Accepted"
  | "Preparing"
  | "Ready"
  | "Picked Up"
  | "Completed"
  | "Rejected"
  | "Cancelled";

export type PaymentStatus =
  | "Unpaid"
  | "Partial"
  | "Paid"
  | "Refunded"
  | "Voided";

const preparationStatusMap: Record<string, PreparationStatus> = {
  accepted: "Accepted",
  approved: "Approved",
  awaitingconfirmation: "Awaiting Confirmation",
  cancelled: "Cancelled",
  canceled: "Cancelled",
  closed: "Completed",
  completed: "Completed",
  confirmed: "Confirmed",
  done: "Completed",
  open: "Requested",
  pickedup: "Picked Up",
  pickup: "Picked Up",
  preparing: "Preparing",
  ready: "Ready",
  rejected: "Rejected",
  requested: "Requested",
  served: "Picked Up",
  submitted: "Requested",
};

const paymentStatusMap: Record<string, PaymentStatus> = {
  awaiting: "Unpaid",
  awaitingpayment: "Unpaid",
  partial: "Partial",
  partiallypaid: "Partial",
  paid: "Paid",
  refunded: "Refunded",
  reversed: "Refunded",
  unpaid: "Unpaid",
  void: "Voided",
  voided: "Voided",
};

export const preparationStatusStyles: Record<PreparationStatus, string> = {
  Requested: "status-requested",
  "Awaiting Confirmation": "status-awaiting-confirmation",
  Confirmed: "status-confirmed",
  Approved: "status-approved",
  Accepted: "status-accepted",
  Preparing: "status-preparing",
  Ready: "status-ready",
  "Picked Up": "status-picked-up",
  Completed: "status-completed",
  Rejected: "status-rejected",
  Cancelled: "status-cancelled",
};

export const paymentStatusStyles: Record<PaymentStatus, string> = {
  Unpaid: "payment-unpaid",
  Partial: "payment-partial",
  Paid: "payment-paid",
  Refunded: "payment-refunded",
  Voided: "payment-voided",
};

function statusKey(value: unknown) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[-_\s]+/g, "");
}

export function normalizePreparationStatus(value: unknown): PreparationStatus {
  return preparationStatusMap[statusKey(value)] || "Requested";
}

export function normalizePaymentStatusForDisplay(
  value: unknown,
): PaymentStatus {
  return paymentStatusMap[statusKey(value)] || "Unpaid";
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
  return normalizePreparationStatus(value) === "Completed";
}
