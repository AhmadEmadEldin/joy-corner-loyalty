import { useEffect, useState } from "react";
import { listOfflineOperations } from "./queue";
import { syncOfflineQueue } from "./sync";

export function OfflineStatus() {
  const [online, setOnline] = useState(navigator.onLine);
  const [pending, setPending] = useState(0);

  useEffect(() => {
    const refresh = () => {
      setOnline(navigator.onLine);
      void listOfflineOperations().then((operations) =>
        setPending(
          operations.filter((operation) => operation.status !== "Synced")
            .length,
        ),
      );
    };
    refresh();
    window.addEventListener("online", refresh);
    window.addEventListener("offline", refresh);
    window.addEventListener("joy-offline-queue-changed", refresh);
    return () => {
      window.removeEventListener("online", refresh);
      window.removeEventListener("offline", refresh);
      window.removeEventListener("joy-offline-queue-changed", refresh);
    };
  }, []);

  if (online && !pending) return null;
  return (
    <aside
      className={`offline-status ${online ? "pending" : "offline"}`}
      role="status"
    >
      <strong>
        {online ? `${pending} operation(s) pending sync` : "Offline"}
      </strong>
      <span>
        {online
          ? "Reconnect sync is available."
          : "Saved on this device — not yet saved to Google Sheets."}
      </span>
      {online && pending > 0 && (
        <button onClick={() => void syncOfflineQueue()} type="button">
          Sync now
        </button>
      )}
    </aside>
  );
}
