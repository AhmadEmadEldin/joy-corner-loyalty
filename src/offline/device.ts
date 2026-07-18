import { offlineDb } from "./db";

export async function getDeviceId() {
  const database = await offlineDb();
  const existing = await database.get("metadata", "deviceId");
  if (existing?.value) return existing.value;
  const value =
    globalThis.crypto?.randomUUID?.() ||
    `device-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  await database.put("metadata", { key: "deviceId", value });
  return value;
}
