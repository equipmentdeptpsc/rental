import type { DeurConflictResult, DeurSyncChangeEnvelope } from "@/features/rental/deur/synchronization/types";
import type {
  AtomicAcceptanceResult,
  DeurSyncServerPersistence,
  ServerAcceptedOperation,
  ServerEntityState,
  StoredServerConflict,
} from "./DeurSyncServerPersistence";

export interface InMemoryServerSnapshot {
  changes: DeurSyncChangeEnvelope[];
  sequence: number;
  operationIds: string[];
  idempotencyKeys: string[];
  entityRevisions: Record<string, number>;
  conflicts: DeurConflictResult[];
}

function clone<T>(value: T): T { return structuredClone(value); }

export class InMemoryDeurSyncServerPersistence implements DeurSyncServerPersistence {
  private changes: DeurSyncChangeEnvelope[] = [];
  private operations = new Map<string, ServerAcceptedOperation>();
  private idempotencyKeys = new Map<string, ServerAcceptedOperation>();
  private entities = new Map<string, ServerEntityState>();
  private conflicts = new Map<string, StoredServerConflict>();
  private failAcceptance = false;

  findByOperationId(id: string) { const value = this.operations.get(id); return value ? clone(value) : undefined; }
  findByIdempotencyKey(id: string) { const value = this.idempotencyKeys.get(id); return value ? clone(value) : undefined; }
  getEntityState(id: string) { const value = this.entities.get(id); return value ? clone(value) : undefined; }

  accept(input: { change: DeurSyncChangeEnvelope; expectedRevision: number }): AtomicAcceptanceResult {
    const change = clone(input.change);
    const replay = this.operations.get(change.operationId) ?? this.idempotencyKeys.get(change.idempotencyKey);
    if (replay) return { kind: "replayed", accepted: clone(replay) };
    const current = this.entities.get(change.entity.id);
    const currentRevision = current?.revision ?? 0;
    if (currentRevision !== input.expectedRevision) return { kind: "revision-mismatch", currentRevision, current: current ? clone(current) : undefined };

    const remoteRevision = currentRevision + 1;
    const stored = { ...change, remoteRevision };
    const accepted: ServerAcceptedOperation = {
      operationId: change.operationId, idempotencyKey: change.idempotencyKey, remoteRevision, change: clone(stored),
    };
    const nextChanges = [...this.changes.map(clone), clone(stored)];
    const nextOperations = new Map(this.operations); nextOperations.set(change.operationId, clone(accepted));
    const nextKeys = new Map(this.idempotencyKeys); nextKeys.set(change.idempotencyKey, clone(accepted));
    const nextEntities = new Map(this.entities); nextEntities.set(change.entity.id, { revision: remoteRevision, latest: clone(stored) });

    if (this.failAcceptance) {
      this.failAcceptance = false;
      throw new Error("Simulated atomic acceptance failure.");
    }
    this.changes = nextChanges;
    this.operations = nextOperations;
    this.idempotencyKeys = nextKeys;
    this.entities = nextEntities;
    return { kind: "accepted", accepted: clone(accepted) };
  }

  readChanges(cursor: number, limit: number) {
    return { changes: this.changes.slice(cursor, cursor + limit).map(clone), total: this.changes.length };
  }
  recordConflict(conflict: StoredServerConflict) {
    const existing = this.conflicts.get(conflict.id);
    if (existing) return clone(existing);
    this.conflicts.set(conflict.id, clone(conflict));
    return clone(conflict);
  }
  findConflict(id: string) { const value = this.conflicts.get(id); return value ? clone(value) : undefined; }
  failNextAcceptance(): void { this.failAcceptance = true; }
  reset(): void { this.changes=[];this.operations.clear();this.idempotencyKeys.clear();this.entities.clear();this.conflicts.clear();this.failAcceptance=false; }
  snapshot(): InMemoryServerSnapshot {
    return {
      changes: this.changes.map(clone), sequence: this.changes.length,
      operationIds: [...this.operations.keys()], idempotencyKeys: [...this.idempotencyKeys.keys()],
      entityRevisions: Object.fromEntries([...this.entities].map(([id, state]) => [id, state.revision])),
      conflicts: [...this.conflicts.values()].map(clone),
    };
  }
}
