export type OfflineOperationType =
  | "CREATE_ORDER"
  | "CREATE_CUSTOMER_DRAFT"
  | "UPDATE_PREPARATION_STATUS"
  | "RECORD_PAYMENT_DRAFT";
export type OfflineOperationStatus =
  | "Pending"
  | "Syncing"
  | "Synced"
  | "Needs Review"
  | "Blocked"
  | "Failed";

export type OfflineOperation = {
  actorRole: string;
  actorUid: string;
  clientRequestId: string;
  createdAt: string;
  deviceId: string;
  lastAttemptAt: string;
  lastError: string;
  localOperationId: string;
  operationType: OfflineOperationType;
  payload: Record<string, unknown>;
  retryCount: number;
  status: OfflineOperationStatus;
};

export type OfflineSyncResult = {
  canonicalId?: string;
  clientRequestId: string;
  message?: string;
  success: boolean;
};
