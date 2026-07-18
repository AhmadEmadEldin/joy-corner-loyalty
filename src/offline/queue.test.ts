import "fake-indexeddb/auto";
import { clearOfflineDatabaseForTests } from "./db";
import {
  enqueueOfflineOperation,
  listOfflineOperations,
  retryOfflineOperation,
  updateOfflineOperation,
} from "./queue";

globalThis.structuredClone ||= ((value: unknown) =>
  JSON.parse(JSON.stringify(value))) as typeof structuredClone;

describe("offline IndexedDB queue", () => {
  beforeEach(async () => {
    await clearOfflineDatabaseForTests();
  });

  it("persists an operation and deduplicates clientRequestId", async () => {
    const first = await enqueueOfflineOperation({
      actorRole: "waiter",
      actorUid: "u1",
      clientRequestId: "request-1",
      operationType: "CREATE_ORDER",
      payload: { itemId: "M-1" },
    });
    const duplicate = await enqueueOfflineOperation({
      actorRole: "waiter",
      actorUid: "u1",
      clientRequestId: "request-1",
      operationType: "CREATE_ORDER",
      payload: { itemId: "M-1" },
    });
    expect(duplicate.localOperationId).toBe(first.localOperationId);
    expect(await listOfflineOperations()).toHaveLength(1);
  });

  it("survives a new database read and preserves retry state", async () => {
    const operation = await enqueueOfflineOperation({
      actorRole: "cashier",
      actorUid: "u1",
      operationType: "RECORD_PAYMENT_DRAFT",
      payload: { amountReceived: 20 },
    });
    await updateOfflineOperation({
      ...operation,
      lastError: "temporary",
      retryCount: 1,
      status: "Pending",
    });
    expect(await listOfflineOperations()).toEqual([
      expect.objectContaining({
        lastError: "temporary",
        retryCount: 1,
        status: "Pending",
      }),
    ]);
  });

  it("requires an explicit retry for review and failed operations", async () => {
    const operation = await enqueueOfflineOperation({
      actorRole: "cashier",
      actorUid: "u1",
      operationType: "RECORD_PAYMENT_DRAFT",
      payload: { amountReceived: 20 },
    });
    await updateOfflineOperation({
      ...operation,
      lastError: "Price conflict",
      retryCount: 5,
      status: "Needs Review",
    });
    await retryOfflineOperation(operation.localOperationId);
    expect(await listOfflineOperations()).toEqual([
      expect.objectContaining({ lastError: "", status: "Pending" }),
    ]);
  });
});
