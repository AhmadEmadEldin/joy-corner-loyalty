import {
  ORDER_STATUS,
  type OperationalOrderStatus,
} from "../src/orderWorkflow";

function statusKey(value: unknown): string {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

export function normalizeImportedOrderStatus(
  value: unknown,
): OperationalOrderStatus {
  const statuses: Record<string, OperationalOrderStatus> = {
    accepted: ORDER_STATUS.IN_PREPARATION,
    awaitingconfirmation: ORDER_STATUS.AWAITING_CONFIRMATION,
    cancelled: ORDER_STATUS.CANCELLED,
    closed: ORDER_STATUS.PICKED_UP,
    complete: ORDER_STATUS.PICKED_UP,
    completed: ORDER_STATUS.PICKED_UP,
    confirmed: ORDER_STATUS.CONFIRMED,
    draft: ORDER_STATUS.DRAFT,
    inpreparation: ORDER_STATUS.IN_PREPARATION,
    pending: ORDER_STATUS.AWAITING_CONFIRMATION,
    pendingconfirmation: ORDER_STATUS.AWAITING_CONFIRMATION,
    pickedup: ORDER_STATUS.PICKED_UP,
    preparing: ORDER_STATUS.IN_PREPARATION,
    ready: ORDER_STATUS.READY,
    rejected: ORDER_STATUS.REJECTED,
    submitted: ORDER_STATUS.SUBMITTED,
  };
  return statuses[statusKey(value)] || ORDER_STATUS.PICKED_UP;
}

export function importedConfirmationStatus(
  status: OperationalOrderStatus,
): "cancelled" | "confirmed" | "pending" | "rejected" {
  if (
    status === ORDER_STATUS.DRAFT ||
    status === ORDER_STATUS.SUBMITTED ||
    status === ORDER_STATUS.AWAITING_CONFIRMATION
  ) {
    return "pending";
  }
  if (status === ORDER_STATUS.REJECTED) return "rejected";
  if (status === ORDER_STATUS.CANCELLED) return "cancelled";
  return "confirmed";
}

export function importedCompletionTimestamp(
  status: OperationalOrderStatus,
  createdAt: string,
): string | null {
  return status === ORDER_STATUS.PICKED_UP ? createdAt : null;
}
