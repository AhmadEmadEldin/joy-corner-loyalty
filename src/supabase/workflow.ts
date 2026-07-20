export const ORDER_STATUSES = [
  "pending_confirmation",
  "confirmed",
  "rejected",
  "accepted",
  "preparing",
  "ready",
  "picked_up",
  "closed",
  "cancelled",
] as const;

export type OperationalOrderStatus = (typeof ORDER_STATUSES)[number];
export type OperationalRole =
  | "owner"
  | "manager"
  | "cashier"
  | "waiter"
  | "barista"
  | "customer";

const transitions: Record<OperationalOrderStatus, OperationalOrderStatus[]> = {
  accepted: ["preparing", "cancelled"],
  cancelled: [],
  closed: [],
  confirmed: ["accepted", "cancelled"],
  pending_confirmation: ["confirmed", "rejected", "cancelled"],
  picked_up: ["closed"],
  preparing: ["ready", "cancelled"],
  ready: ["picked_up", "cancelled"],
  rejected: [],
};

export function canTransitionOrder(
  from: OperationalOrderStatus,
  to: OperationalOrderStatus,
): boolean {
  return transitions[from].includes(to);
}

export function statusLabel(status: OperationalOrderStatus): string {
  const operationalLabels: Record<OperationalOrderStatus, string> = {
    accepted: "Accepted by barista",
    cancelled: "Cancelled",
    closed: "Completed",
    confirmed: "Confirmed by cashier",
    pending_confirmation: "Pending cashier confirmation",
    picked_up: "Picked up",
    preparing: "Preparing",
    ready: "Ready",
    rejected: "Rejected",
  };
  return operationalLabels[status];
}

export function statusProgress(status: OperationalOrderStatus): number {
  const progress: Partial<Record<OperationalOrderStatus, number>> = {
    pending_confirmation: 0,
    confirmed: 20,
    accepted: 40,
    preparing: 60,
    ready: 80,
    picked_up: 90,
    closed: 100,
  };
  return progress[status] ?? 0;
}
