import type { DeurConflictResult, DeurSyncChangeEnvelope } from "@/features/rental/deur/synchronization/types";

export interface ServerAcceptedOperation {
  operationId: string;
  idempotencyKey: string;
  remoteRevision: number;
  change: DeurSyncChangeEnvelope;
}

export interface ServerEntityState {
  revision: number;
  latest: DeurSyncChangeEnvelope;
}

export interface StoredServerConflict extends DeurConflictResult { id: string }

export type AtomicAcceptanceResult =
  | { kind: "accepted"; accepted: ServerAcceptedOperation }
  | { kind: "replayed"; accepted: ServerAcceptedOperation }
  | { kind: "revision-mismatch"; currentRevision: number; current?: ServerEntityState };

export type MaybePromise<T> = T | Promise<T>;

export interface DeurSyncServerPersistence {
  findByOperationId(operationId: string): MaybePromise<ServerAcceptedOperation | undefined>;
  findByIdempotencyKey(idempotencyKey: string): MaybePromise<ServerAcceptedOperation | undefined>;
  getEntityState(entityId: string): MaybePromise<ServerEntityState | undefined>;
  accept(input: { change: DeurSyncChangeEnvelope; expectedRevision: number }): MaybePromise<AtomicAcceptanceResult>;
  readChanges(cursor: number, limit: number): MaybePromise<{ changes: DeurSyncChangeEnvelope[]; total: number; nextCursor?: number }>;
  recordConflict(conflict: StoredServerConflict): MaybePromise<StoredServerConflict>;
  findConflict(id: string): MaybePromise<StoredServerConflict | undefined>;
  reset(): MaybePromise<void>;
}
