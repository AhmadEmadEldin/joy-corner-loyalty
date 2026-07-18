import { offlineDb } from "./db";
import { getDeviceId } from "./device";
import type {
  OfflineOperation,
  OfflineOperationStatus,
  OfflineOperationType,
} from "./types";

export async function enqueueOfflineOperation(
  input: {
    actorRole: string;
    actorUid: string;
    clientRequestId?: string;
    operationType: OfflineOperationType;
    payload: Record<string, unknown>;
  },
  maximumQueueSize = 250,
) {
  const database = await offlineDb();
  const existing = input.clientRequestId
    ? await database.getFromIndex(
        "operations",
        "by-client-request",
        input.clientRequestId,
      )
    : undefined;
  if (existing) return existing;
  if ((await database.count("operations")) >= maximumQueueSize) {
    throw new Error(
      "Offline queue is full. Reconnect before creating more operations.",
    );
  }

  const clientRequestId = input.clientRequestId || crypto.randomUUID();
  const operation: OfflineOperation = {
    actorRole: input.actorRole,
    actorUid: input.actorUid,
    clientRequestId,
    createdAt: new Date().toISOString(),
    deviceId: await getDeviceId(),
    lastAttemptAt: "",
    lastError: "",
    localOperationId: crypto.randomUUID(),
    operationType: input.operationType,
    payload: { ...input.payload, clientRequestId },
    retryCount: 0,
    status: "Pending",
  };
  await database.put("operations", operation);
  dispatchQueueChanged();
  return operation;
}

export async function listOfflineOperations(status?: OfflineOperationStatus) {
  const database = await offlineDb();
  return status
    ? await database.getAllFromIndex("operations", "by-status", status)
    : await database.getAll("operations");
}

export async function updateOfflineOperation(operation: OfflineOperation) {
  const database = await offlineDb();
  await database.put("operations", operation);
  dispatchQueueChanged();
  return operation;
}

export async function retryOfflineOperation(localOperationId: string) {
  const database = await offlineDb();
  const operation = await database.get("operations", localOperationId);
  if (!operation || operation.status === "Synced") return operation;
  return await updateOfflineOperation({
    ...operation,
    lastError: "",
    status: "Pending",
  });
}

export async function removeSyncedOperations() {
  const database = await offlineDb();
  const synced = await database.getAllFromIndex(
    "operations",
    "by-status",
    "Synced",
  );
  await Promise.all(
    synced.map((operation) =>
      database.delete("operations", operation.localOperationId),
    ),
  );
  dispatchQueueChanged();
}

export function dispatchQueueChanged() {
  globalThis.dispatchEvent?.(new Event("joy-offline-queue-changed"));
}
