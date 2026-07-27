export const ORDER_STATUS = {
  DRAFT: "draft",
  SUBMITTED: "submitted",
  AWAITING_CONFIRMATION: "awaiting_confirmation",
  CONFIRMED: "confirmed",
  IN_PREPARATION: "in_preparation",
  READY: "ready",
  PICKED_UP: "picked_up",
  CANCELLED: "cancelled",
  REJECTED: "rejected",
} as const;

export const PAYMENT_STATUS = {
  UNPAID: "unpaid",
  PARTIALLY_PAID: "partially_paid",
  PAID: "paid",
  REFUNDED: "refunded",
  VOIDED: "voided",
} as const;

export type OperationalOrderStatus =
  (typeof ORDER_STATUS)[keyof typeof ORDER_STATUS];
export type OperationalPaymentStatus =
  (typeof PAYMENT_STATUS)[keyof typeof PAYMENT_STATUS];
export type OperationalRole =
  | "owner"
  | "manager"
  | "cashier"
  | "waiter"
  | "barista"
  | "customer";

export const ACTIVE_ORDER_STATUSES: readonly OperationalOrderStatus[] = [
  ORDER_STATUS.SUBMITTED,
  ORDER_STATUS.AWAITING_CONFIRMATION,
  ORDER_STATUS.CONFIRMED,
  ORDER_STATUS.IN_PREPARATION,
  ORDER_STATUS.READY,
];

const transitions: Record<
  OperationalOrderStatus,
  readonly OperationalOrderStatus[]
> = {
  [ORDER_STATUS.DRAFT]: [ORDER_STATUS.SUBMITTED, ORDER_STATUS.CANCELLED],
  [ORDER_STATUS.SUBMITTED]: [
    ORDER_STATUS.AWAITING_CONFIRMATION,
    ORDER_STATUS.CANCELLED,
  ],
  [ORDER_STATUS.AWAITING_CONFIRMATION]: [
    ORDER_STATUS.CONFIRMED,
    ORDER_STATUS.REJECTED,
    ORDER_STATUS.CANCELLED,
  ],
  [ORDER_STATUS.CONFIRMED]: [
    ORDER_STATUS.IN_PREPARATION,
    ORDER_STATUS.CANCELLED,
  ],
  [ORDER_STATUS.IN_PREPARATION]: [
    ORDER_STATUS.READY,
    ORDER_STATUS.CANCELLED,
  ],
  [ORDER_STATUS.READY]: [ORDER_STATUS.PICKED_UP, ORDER_STATUS.CANCELLED],
  [ORDER_STATUS.PICKED_UP]: [],
  [ORDER_STATUS.CANCELLED]: [],
  [ORDER_STATUS.REJECTED]: [],
};

const legacyAliases: Record<string, OperationalOrderStatus> = {
  accepted: ORDER_STATUS.IN_PREPARATION,
  archived: ORDER_STATUS.PICKED_UP,
  awaitingconfirmation: ORDER_STATUS.AWAITING_CONFIRMATION,
  cancelled: ORDER_STATUS.CANCELLED,
  canceled: ORDER_STATUS.CANCELLED,
  closed: ORDER_STATUS.PICKED_UP,
  confirmed: ORDER_STATUS.CONFIRMED,
  done: ORDER_STATUS.PICKED_UP,
  draft: ORDER_STATUS.DRAFT,
  inpreparation: ORDER_STATUS.IN_PREPARATION,
  open: ORDER_STATUS.AWAITING_CONFIRMATION,
  pendingconfirmation: ORDER_STATUS.AWAITING_CONFIRMATION,
  pickedup: ORDER_STATUS.PICKED_UP,
  preparing: ORDER_STATUS.IN_PREPARATION,
  ready: ORDER_STATUS.READY,
  rejected: ORDER_STATUS.REJECTED,
  requested: ORDER_STATUS.SUBMITTED,
  served: ORDER_STATUS.PICKED_UP,
  submitted: ORDER_STATUS.SUBMITTED,
};

export function normalizeOperationalOrderStatus(
  value: unknown,
): OperationalOrderStatus {
  const normalized = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[-_\s]+/g, "");
  return legacyAliases[normalized] || ORDER_STATUS.AWAITING_CONFIRMATION;
}

export function canTransitionOrder(
  from: OperationalOrderStatus,
  to: OperationalOrderStatus,
): boolean {
  return transitions[from].includes(to);
}

export function canRoleTransitionOrder(
  role: OperationalRole,
  from: OperationalOrderStatus,
  to: OperationalOrderStatus,
): boolean {
  if (!canTransitionOrder(from, to)) return false;
  if (role === "owner" || role === "manager") return true;
  if (to === ORDER_STATUS.CANCELLED) {
    return role === "cashier" || role === "barista";
  }
  if (
    from === ORDER_STATUS.AWAITING_CONFIRMATION &&
    (to === ORDER_STATUS.CONFIRMED || to === ORDER_STATUS.REJECTED)
  ) {
    return role === "cashier";
  }
  if (
    ([
      ORDER_STATUS.CONFIRMED,
      ORDER_STATUS.IN_PREPARATION,
      ORDER_STATUS.READY,
    ] as OperationalOrderStatus[]).includes(from)
  ) {
    return role === "barista";
  }
  return false;
}

export function statusLabel(status: OperationalOrderStatus): string {
  const labels: Record<OperationalOrderStatus, string> = {
    [ORDER_STATUS.DRAFT]: "Draft",
    [ORDER_STATUS.SUBMITTED]: "Order received",
    [ORDER_STATUS.AWAITING_CONFIRMATION]: "Waiting for confirmation",
    [ORDER_STATUS.CONFIRMED]: "Confirmed",
    [ORDER_STATUS.IN_PREPARATION]: "Being prepared",
    [ORDER_STATUS.READY]: "Ready for pickup",
    [ORDER_STATUS.PICKED_UP]: "Picked up",
    [ORDER_STATUS.CANCELLED]: "Cancelled",
    [ORDER_STATUS.REJECTED]: "Rejected",
  };
  return labels[status];
}

export function statusProgress(status: OperationalOrderStatus): number {
  const progress: Record<OperationalOrderStatus, number> = {
    [ORDER_STATUS.DRAFT]: 0,
    [ORDER_STATUS.SUBMITTED]: 10,
    [ORDER_STATUS.AWAITING_CONFIRMATION]: 25,
    [ORDER_STATUS.CONFIRMED]: 45,
    [ORDER_STATUS.IN_PREPARATION]: 65,
    [ORDER_STATUS.READY]: 85,
    [ORDER_STATUS.PICKED_UP]: 100,
    [ORDER_STATUS.CANCELLED]: 0,
    [ORDER_STATUS.REJECTED]: 0,
  };
  return progress[status];
}

export function derivePaymentStatusMinor(
  totalMinor: number,
  paidMinor: number,
): OperationalPaymentStatus {
  if (paidMinor <= 0) return PAYMENT_STATUS.UNPAID;
  if (paidMinor < totalMinor) return PAYMENT_STATUS.PARTIALLY_PAID;
  return PAYMENT_STATUS.PAID;
}

export function toMinorUnits(amount: number): number {
  if (!Number.isFinite(amount)) throw new Error("Money amount must be finite.");
  return Math.round((amount + Number.EPSILON) * 100);
}

export function fromMinorUnits(amountMinor: number): number {
  if (!Number.isSafeInteger(amountMinor)) {
    throw new Error("Minor-unit amount must be a safe integer.");
  }
  return amountMinor / 100;
}
