import { auth } from "../firebase";
import { listOfflineOperations, updateOfflineOperation } from "./queue";
import type { OfflineOperation, OfflineSyncResult } from "./types";
import { classifySyncFailure } from "./syncPolicy";

const defaultActionMap = {
  CREATE_CUSTOMER_DRAFT: "addCustomer",
  CREATE_ORDER: "addReceipt",
  RECORD_PAYMENT_DRAFT: "collectReceiptPayment",
  UPDATE_PREPARATION_STATUS: "markReceiptPreparing",
} as const;

const allowedActions = new Set([
  "addCustomer",
  "registerCustomerProfile",
  "addReceipt",
  "submitCustomerOrder",
  "markReceiptAccepted",
  "markReceiptPreparing",
  "markReceiptReady",
  "markReceiptDone",
  "pickupOrder",
  "completeOrder",
  "collectReceiptPayment",
  "addPayment",
]);

let syncPromise: Promise<OfflineOperation[]> | undefined;

export function syncOfflineQueue() {
  syncPromise ||= synchronize().finally(() => {
    syncPromise = undefined;
  });
  return syncPromise;
}

async function synchronize() {
  if (!navigator.onLine) return await listOfflineOperations();
  const user = auth?.currentUser;
  const pending = (await listOfflineOperations()).filter(
    (operation) => operation.status === "Pending",
  );

  for (const operation of pending) {
    if (!user || user.uid !== operation.actorUid) {
      await updateOfflineOperation({
        ...operation,
        lastError:
          "The signed-in Firebase user changed before synchronization.",
        status: "Blocked",
      });
      continue;
    }

    await updateOfflineOperation({
      ...operation,
      lastAttemptAt: new Date().toISOString(),
      status: "Syncing",
    });
    try {
      const response = await send(operation, await user.getIdToken());
      await updateOfflineOperation({
        ...operation,
        lastAttemptAt: new Date().toISOString(),
        lastError: "",
        payload: {
          ...operation.payload,
          canonicalId: response.canonicalId || "",
        },
        status: "Synced",
      });
    } catch (error) {
      const syncError = error as Error & { statusCode?: number };
      const retryCount = operation.retryCount + 1;
      await updateOfflineOperation({
        ...operation,
        lastAttemptAt: new Date().toISOString(),
        lastError: syncError.message,
        retryCount,
        status: classifySyncFailure(
          syncError.message,
          retryCount,
          syncError.statusCode,
        ),
      });
    }
  }
  return await listOfflineOperations();
}

async function send(
  operation: OfflineOperation,
  token: string,
): Promise<OfflineSyncResult> {
  const requestedAction = String(operation.payload._offlineAction || "");
  const action = allowedActions.has(requestedAction)
    ? requestedAction
    : defaultActionMap[operation.operationType];
  const payload = { ...operation.payload };
  delete payload._offlineAction;
  const response = await fetch("/api", {
    body: JSON.stringify({
      action,
      ...payload,
      clientRequestId: operation.clientRequestId,
      deviceId: operation.deviceId,
      offlineCreated: true,
      offlineCreatedAt: operation.createdAt,
    }),
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "text/plain;charset=utf-8",
    },
    method: "POST",
  });
  const json = (await response.json().catch(() => ({}))) as Record<
    string,
    unknown
  >;
  if (!response.ok || json.success === false) {
    const error = new Error(
      String(json.message || `Synchronization failed (${response.status}).`),
    ) as Error & { statusCode?: number };
    error.statusCode = response.status;
    throw error;
  }
  return {
    canonicalId: String(
      json.orderId || json.paymentId || json.customerId || "",
    ),
    clientRequestId: operation.clientRequestId,
    success: true,
  };
}

export function installOfflineSynchronization() {
  const synchronizeNow = () => void syncOfflineQueue();
  const synchronizeWhenVisible = () => {
    if (!document.hidden && navigator.onLine) synchronizeNow();
  };
  window.addEventListener("online", synchronizeNow);
  document.addEventListener("visibilitychange", synchronizeWhenVisible);
  if ("serviceWorker" in navigator) {
    void navigator.serviceWorker
      .register("/service-worker.js")
      .then((registration) =>
        (
          registration as ServiceWorkerRegistration & {
            sync?: { register(tag: string): Promise<void> };
          }
        ).sync?.register("joy-corner-sync"),
      )
      .catch(() => undefined);
  }
  return () => {
    window.removeEventListener("online", synchronizeNow);
    document.removeEventListener("visibilitychange", synchronizeWhenVisible);
  };
}
