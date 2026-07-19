import { DBSchema, IDBPDatabase, openDB } from "idb";
import type { OfflineOperation } from "./types";

interface JoyOfflineDb extends DBSchema {
  metadata: { key: string; value: { key: string; value: string } };
  operations: {
    key: string;
    value: OfflineOperation;
    indexes: { "by-client-request": string; "by-status": string };
  };
}

let databasePromise: Promise<IDBPDatabase<JoyOfflineDb>> | undefined;

export function offlineDb() {
  databasePromise ||= openDB<JoyOfflineDb>("joy-corner-offline", 1, {
    upgrade(database) {
      const operations = database.createObjectStore("operations", {
        keyPath: "localOperationId",
      });
      operations.createIndex("by-client-request", "clientRequestId", {
        unique: true,
      });
      operations.createIndex("by-status", "status");
      database.createObjectStore("metadata", { keyPath: "key" });
    },
  });
  return databasePromise;
}

export async function clearOfflineDatabaseForTests() {
  const database = await offlineDb();
  await database.clear("operations");
  await database.clear("metadata");
}

export async function putOfflineMetadata(key: string, value: string) {
  const database = await offlineDb();
  await database.put("metadata", { key, value });
}

export async function getOfflineMetadata(key: string) {
  const database = await offlineDb();
  return (await database.get("metadata", key))?.value || "";
}
