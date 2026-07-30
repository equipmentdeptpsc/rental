export type OfflineCommandType =
  | "START_SHIFT"
  | "CHANGE_ACTIVITY"
  | "STOP_ACTIVITY"
  | "COMPLETE_SHIFT"
  | "SUBMIT_DEUR"
  | "CREATE_CORRECTION_REVISION";

export type OfflineCommandStatus = "QUEUED" | "REPLAYING" | "ACCEPTED" | "CONFLICT" | "REJECTED";

export interface OfflineCommandEnvelope<TPayload = unknown> {
  commandId: string;
  idempotencyKey: string;
  commandType: OfflineCommandType;
  userId: string;
  operatorId: string;
  rentalId: string;
  rentalLineId: string;
  deurId?: string;
  equipmentId: string;
  expectedVersion: number;
  clientCreatedAt: string;
  clientSequence: number;
  payload: TPayload;
  retryCount: number;
  lastError?: { code: string; retryable: boolean };
  status: OfflineCommandStatus;
}
