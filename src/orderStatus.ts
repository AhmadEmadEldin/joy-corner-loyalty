import { OrderStatus } from "./domain";

export const orderStatusTransitions: Record<OrderStatus, OrderStatus[]> = {
  Draft: ["Submitted", "Cancelled"],
  Submitted: ["Accepted", "Cancelled"],
  Accepted: ["Preparing", "Picked Up", "Cancelled"],
  Preparing: ["Ready", "Picked Up", "Cancelled"],
  Ready: ["Picked Up", "Cancelled"],
  "Picked Up": [],
  Served: ["Awaiting Payment", "Paid", "Unpaid"],
  "Awaiting Payment": ["Partially Paid", "Paid", "Unpaid", "Cancelled"],
  "Partially Paid": ["Paid", "Unpaid", "Refunded"],
  Paid: ["Refunded", "Archived"],
  Unpaid: ["Partially Paid", "Paid", "Archived"],
  Cancelled: ["Archived"],
  Refunded: ["Archived"],
  Archived: [],
};

const legacyStatusMap: Record<string, OrderStatus> = {
  accepted: "Accepted",
  archived: "Archived",
  cancelled: "Cancelled",
  canceled: "Cancelled",
  done: "Picked Up",
  draft: "Draft",
  open: "Submitted",
  paid: "Paid",
  partial: "Partially Paid",
  partiallypaid: "Partially Paid",
  pickedup: "Picked Up",
  preparing: "Preparing",
  ready: "Ready",
  refunded: "Refunded",
  requested: "Submitted",
  served: "Picked Up",
  submitted: "Submitted",
  unpaid: "Unpaid",
};

export function normalizeOrderStatus(value: unknown): OrderStatus {
  const key = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[-_\s]+/g, "");
  return legacyStatusMap[key] || "Submitted";
}

export function canTransitionOrderStatus(from: unknown, to: unknown) {
  const source = normalizeOrderStatus(from);
  const target = normalizeOrderStatus(to);
  return source === target || orderStatusTransitions[source].includes(target);
}
