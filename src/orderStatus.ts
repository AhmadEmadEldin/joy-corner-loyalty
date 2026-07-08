import { OrderStatus } from "./domain";

export const orderStatusTransitions: Record<OrderStatus, OrderStatus[]> = {
  Draft: ["Submitted", "Cancelled"],
  Submitted: ["Accepted", "Preparing", "Served", "Cancelled"],
  Accepted: ["Preparing", "Ready", "Served", "Cancelled"],
  Preparing: ["Ready", "Cancelled"],
  Ready: ["Served", "Awaiting Payment", "Paid", "Unpaid"],
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
  done: "Served",
  draft: "Draft",
  open: "Submitted",
  paid: "Paid",
  partial: "Partially Paid",
  partiallypaid: "Partially Paid",
  pickedup: "Served",
  preparing: "Preparing",
  ready: "Ready",
  refunded: "Refunded",
  requested: "Submitted",
  served: "Served",
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
