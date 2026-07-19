import type { DeurQueueOperation } from "../offline/types";

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

export interface DeurSyncEntityIdentifier {
  type: "DEUR";
  id: string;
}

export type DeurSyncOperationIdentifier = string;
export type DeurSyncIdempotencyKey = string;
export type DeurLocalRevision = number;
export type DeurRemoteRevision = number;
export type DeurSyncCursor = string;

export interface DeurSyncChangeEnvelope {
  schemaVersion: 1;
  entity: DeurSyncEntityIdentifier;
  operation: DeurQueueOperation;
  operationId: DeurSyncOperationIdentifier;
  idempotencyKey: DeurSyncIdempotencyKey;
  localRevision: DeurLocalRevision;
  baseRemoteRevision: DeurRemoteRevision;
  remoteRevision?: DeurRemoteRevision;
  occurredAt: string;
  payload?: JsonValue;
}

export interface DeurPushRequest {
  changes: DeurSyncChangeEnvelope[];
  cursor?: DeurSyncCursor;
}

export interface DeurAcceptedChange {
  operationId: DeurSyncOperationIdentifier;
  idempotencyKey: DeurSyncIdempotencyKey;
  remoteRevision: DeurRemoteRevision;
  alreadyAccepted: boolean;
}

export type DeurRejectionReason = "malformed-payload" | "unsupported-schema-version" | "validation";

export interface DeurRejectedChange {
  operationId?: DeurSyncOperationIdentifier;
  reason: DeurRejectionReason;
  message: string;
}

export type DeurConflictReason =
  | "competing-activity-edit"
  | "competing-event-edit"
  | "competing-record-edit"
  | "delete-versus-update"
  | "stale-local"
  | "stale-remote";

export interface DeurConflictResult {
  operationId: DeurSyncOperationIdentifier;
  reason: DeurConflictReason;
  message: string;
  local: DeurSyncChangeEnvelope;
  remote: DeurSyncChangeEnvelope;
}

export type DeurTransportErrorClassification =
  | "network" | "timeout" | "aborted" | "unavailable" | "unauthenticated" | "unauthorized"
  | "validation" | "conflict" | "rate-limited" | "server" | "malformed-response"
  | "unsupported-protocol" | "invalid-response" | "unknown";

export interface DeurTransportError {
  classification: DeurTransportErrorClassification;
  message: string;
  retryable: boolean;
}

export interface DeurPushResult {
  accepted: DeurAcceptedChange[];
  rejected: DeurRejectedChange[];
  conflicts: DeurConflictResult[];
  cursor: DeurSyncCursor;
  transportError?: DeurTransportError;
}

export interface DeurPullRequest {
  cursor?: DeurSyncCursor;
  limit?: number;
}

export interface DeurPullResult {
  changes: DeurSyncChangeEnvelope[];
  cursor: DeurSyncCursor;
  hasMore: boolean;
  transportError?: DeurTransportError;
}

/** Backend-independent physical-device synchronization port. */
export interface DeurRemoteSyncTransport {
  push(request: DeurPushRequest): Promise<DeurPushResult>;
  pull(request: DeurPullRequest): Promise<DeurPullResult>;
}
