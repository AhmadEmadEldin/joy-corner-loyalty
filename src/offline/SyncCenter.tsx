import { useEffect, useState } from "react";
import {
  listOfflineOperations,
  removeSyncedOperations,
  retryOfflineOperation,
} from "./queue";
import { syncOfflineQueue } from "./sync";
import type { OfflineOperation } from "./types";

export function SyncCenter() {
  const [operations, setOperations] = useState<OfflineOperation[]>([]);
  const refresh = () => void listOfflineOperations().then(setOperations);

  useEffect(() => {
    refresh();
    window.addEventListener("joy-offline-queue-changed", refresh);
    return () =>
      window.removeEventListener("joy-offline-queue-changed", refresh);
  }, []);

  return (
    <section className="sync-center">
      <h3>Device Sync Center</h3>
      <p className="muted">
        {operations.length
          ? `${operations.length} operation(s) retained on this device.`
          : "No queued device operations."}
      </p>
      <div className="actions">
        <button onClick={() => void syncOfflineQueue()} type="button">
          Synchronize pending
        </button>
        <button onClick={() => void removeSyncedOperations()} type="button">
          Clear synced
        </button>
      </div>
      {operations.map((operation) => (
        <article key={operation.localOperationId}>
          <strong>{operation.operationType}</strong>
          <span>{operation.status}</span>
          <small>{operation.lastError || operation.clientRequestId}</small>
          {["Failed", "Needs Review", "Blocked"].includes(operation.status) && (
            <button
              onClick={() =>
                void retryOfflineOperation(operation.localOperationId).then(
                  () => syncOfflineQueue(),
                )
              }
              type="button"
            >
              Retry
            </button>
          )}
        </article>
      ))}
    </section>
  );
}
