import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./app";
import { OfflineStatus } from "./offline/OfflineStatus";
import {
  installOfflineSynchronization,
  syncOfflineQueue,
} from "./offline/sync";
import "./app.css";

const root = document.getElementById("root");

if (!root) {
  throw new Error("Missing root element.");
}

createRoot(root).render(
  <StrictMode>
    <App />
    <OfflineStatus />
  </StrictMode>,
);

installOfflineSynchronization();
navigator.serviceWorker?.addEventListener("message", (event) => {
  if (event.data?.type === "JOY_SYNC_REQUEST") void syncOfflineQueue();
});
