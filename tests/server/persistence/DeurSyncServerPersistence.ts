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

export interface DeurSyncServerPersistence {
  findByOperationId(operationId: string): ServerAcceptedOperation | undefined;
  findByIdempotencyKey(idempotencyKey: string): ServerAcceptedOperation | undefined;
  getEntityState(entityId: string): ServerEntityState | undefined;
  accept(input: { change: DeurSyncChangeEnvelope; expectedRevision: number }): AtomicAcceptanceResult;
  readChanges(cursor: number, limit: number): { changes: DeurSyncChangeEnvelope[]; total: number };
  recordConflict(conflict: StoredServerConflict): StoredServerConflict;
  findConflict(id: string): StoredServerConflict | undefined;
  reset(): void;
}
