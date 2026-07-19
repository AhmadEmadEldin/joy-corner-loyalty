import type { OfflineOperationStatus } from "./types";

export function classifySyncFailure(
  message: string,
  retryCount: number,
  statusCode = 0,
): OfflineOperationStatus {
  if (statusCode === 401 || statusCode === 403) return "Blocked";
  if (/price|sold out|size|customer conflict|needs review/i.test(message)) {
    return "Needs Review";
  }
  return retryCount >= 5 ? "Failed" : "Pending";
}
