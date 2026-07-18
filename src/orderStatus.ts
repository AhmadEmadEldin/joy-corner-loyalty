import { OrderStatus, StaffRole } from "./domain";

export const orderStatusTransitions: Record<OrderStatus, OrderStatus[]> = {
  Requested: ["Awaiting Confirmation", "Rejected", "Cancelled"],
  "Awaiting Confirmation": ["Confirmed", "Cancelled"],
  Confirmed: ["Approved", "Cancelled"],
  Approved: ["Accepted", "Cancelled"],
  Accepted: ["Preparing", "Cancelled"],
  Preparing: ["Ready", "Cancelled"],
  Ready: ["Picked Up", "Cancelled"],
  "Picked Up": ["Completed"],
  Completed: [],
  Rejected: [],
  Cancelled: [],
};

const legacyStatusMap: Record<string, OrderStatus> = {
  accepted: "Accepted",
  approved: "Approved",
  archived: "Completed",
  awaitingconfirmation: "Awaiting Confirmation",
  cancelled: "Cancelled",
  canceled: "Cancelled",
  closed: "Completed",
  completed: "Completed",
  confirmed: "Confirmed",
  done: "Completed",
  draft: "Requested",
  open: "Requested",
  paid: "Completed",
  partial: "Completed",
  partiallypaid: "Completed",
  pickedup: "Picked Up",
  preparing: "Preparing",
  ready: "Ready",
  refunded: "Completed",
  rejected: "Rejected",
  requested: "Requested",
  served: "Picked Up",
  submitted: "Requested",
  unpaid: "Completed",
};

export function normalizeOrderStatus(value: unknown): OrderStatus {
  const key = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[-_\s]+/g, "");
  return legacyStatusMap[key] || "Requested";
}

export function canTransitionOrderStatus(from: unknown, to: unknown) {
  const source = normalizeOrderStatus(from);
  const target = normalizeOrderStatus(to);
  return source === target || orderStatusTransitions[source].includes(target);
}

export type OrderTransitionActor = {
  customerOwnsOrder?: boolean;
  role?: StaffRole | "customer";
};

export type OrderTransitionDecision = {
  allowed: boolean;
  reason?: string;
  source: OrderStatus;
  target: OrderStatus;
};

export function validateOrderTransition(options: {
  actor: OrderTransitionActor;
  from: unknown;
  reason?: unknown;
  to: unknown;
}): OrderTransitionDecision {
  const source = normalizeOrderStatus(options.from);
  const target = normalizeOrderStatus(options.to);
  const role = options.actor.role || "customer";
  const reason = String(options.reason || "").trim();

  if (source === target) return { allowed: true, source, target };
  if (!orderStatusTransitions[source].includes(target)) {
    return {
      allowed: false,
      reason: `Transition ${source} -> ${target} is not allowed.`,
      source,
      target,
    };
  }

  if (role === "customer") {
    const customerAllowed =
      options.actor.customerOwnsOrder === true &&
      ((source === "Awaiting Confirmation" && target === "Confirmed") ||
        (["Requested", "Awaiting Confirmation", "Confirmed"].includes(source) &&
          target === "Cancelled"));
    return customerAllowed
      ? { allowed: true, source, target }
      : {
          allowed: false,
          reason:
            "Customers may only confirm or cancel their own eligible orders.",
          source,
          target,
        };
  }

  const operationalRoles = new Set<StaffRole>([
    "owner",
    "manager",
    "cashier",
    "waiter",
    "barista",
  ]);
  if (!operationalRoles.has(role as StaffRole)) {
    return {
      allowed: false,
      reason: "Unknown order actor role.",
      source,
      target,
    };
  }

  if (
    target === "Awaiting Confirmation" &&
    !["owner", "manager", "cashier"].includes(role)
  ) {
    return {
      allowed: false,
      reason: "Only a cashier or manager may request confirmation.",
      source,
      target,
    };
  }
  if (
    target === "Confirmed" &&
    !["owner", "manager", "cashier", "waiter"].includes(role)
  ) {
    return {
      allowed: false,
      reason: "This role cannot record assisted confirmation.",
      source,
      target,
    };
  }
  if (
    ["Approved", "Rejected"].includes(target) &&
    !["owner", "manager", "cashier"].includes(role)
  ) {
    return {
      allowed: false,
      reason: "Only a cashier or manager may approve or reject an order.",
      source,
      target,
    };
  }
  if (
    ["Accepted", "Preparing", "Ready", "Picked Up", "Completed"].includes(
      target,
    ) &&
    !["owner", "manager", "barista"].includes(role)
  ) {
    return {
      allowed: false,
      reason: "Only barista operations or management may advance preparation.",
      source,
      target,
    };
  }
  if (
    target === "Cancelled" &&
    ["Accepted", "Preparing", "Ready"].includes(source)
  ) {
    if (!["owner", "manager"].includes(role)) {
      return {
        allowed: false,
        reason: "Cancellation after acceptance requires a manager override.",
        source,
        target,
      };
    }
    if (!reason) {
      return {
        allowed: false,
        reason: "A cancellation reason is required after acceptance.",
        source,
        target,
      };
    }
  }

  return { allowed: true, source, target };
}
