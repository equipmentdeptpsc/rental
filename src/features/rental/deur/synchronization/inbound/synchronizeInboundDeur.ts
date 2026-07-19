import type { DeurRecord } from "../../types";
import { reconcileDeurChanges } from "../reconcileDeurChanges";
import type { DeurConflictReason, DeurRemoteSyncTransport, DeurSyncChangeEnvelope, JsonValue } from "../types";
import type { DeurAppliedOperationRepository } from "./DeurAppliedOperationRepository";
import type { DeurConflictRepository } from "./DeurConflictRepository";
import type { DeurSyncCursorRepository } from "./DeurSyncCursorRepository";

interface InboundDeurRepository {
  getById(id: string): DeurRecord | undefined;
  applyInbound(record: DeurRecord): DeurRecord;
  deleteInbound(id: string): boolean;
}

export interface InboundDeurSyncDependencies {
  transport: DeurRemoteSyncTransport;
  deurs: InboundDeurRepository;
  cursors: DeurSyncCursorRepository;
  appliedOperations: DeurAppliedOperationRepository;
  conflicts: DeurConflictRepository;
}

export interface InboundDeurSyncResult {
  success: boolean;
  pulled: number;
  applied: number;
  duplicates: number;
  conflicts: number;
  rejected: number;
  cursor?: string;
  error?: string;
}

function json(value: unknown): JsonValue {
  return JSON.parse(JSON.stringify(value)) as JsonValue;
}

function readRecord(change: DeurSyncChangeEnvelope): DeurRecord | undefined {
  const payload = change.payload;
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return undefined;
  const candidate = payload as Record<string, JsonValue>;
  if (
    candidate.id !== change.entity.id ||
    typeof candidate.rentalId !== "string" ||
    typeof candidate.equipmentId !== "string" ||
    typeof candidate.operatorId !== "string" ||
    typeof candidate.workDate !== "string" ||
    !Array.isArray(candidate.logs) ||
    candidate.logs.some((item) => typeof item !== "object" || item === null || Array.isArray(item) || typeof item.id !== "string") ||
    typeof candidate.createdAt !== "string" ||
    typeof candidate.updatedAt !== "string"
  ) return undefined;
  return structuredClone(candidate) as unknown as DeurRecord;
}

function localEnvelope(record: DeurRecord, remote: DeurSyncChangeEnvelope): DeurSyncChangeEnvelope {
  return {
    schemaVersion: 1,
    entity: { type: "DEUR", id: record.id },
    operation: "update",
    operationId: `local:${record.id}:${record.updatedAt}`,
    idempotencyKey: `local:${record.id}:${record.updatedAt}`,
    localRevision: 1,
    baseRemoteRevision: remote.baseRemoteRevision,
    remoteRevision: remote.baseRemoteRevision,
    occurredAt: record.updatedAt,
    payload: json(record),
  };
}

function conflictReason(kind: "stale-local" | "stale-remote"): DeurConflictReason {
  return kind;
}

export async function synchronizeInboundDeur(
  dependencies: InboundDeurSyncDependencies,
  detectedAt = new Date().toISOString(),
): Promise<InboundDeurSyncResult> {
  const previousCursor = dependencies.cursors.get();
  const base: InboundDeurSyncResult = {
    success: false, pulled: 0, applied: 0, duplicates: 0, conflicts: 0, rejected: 0, cursor: previousCursor,
  };

  let pulled;
  try {
    pulled = await dependencies.transport.pull({ cursor: previousCursor });
  } catch (error) {
    return { ...base, error: error instanceof Error ? error.message : "Inbound DEUR pull failed." };
  }
  if (pulled.transportError) return { ...base, error: pulled.transportError.message };
  const result = { ...base, pulled: pulled.changes.length };

  try {
    for (const remoteInput of pulled.changes) {
      const remote = structuredClone(remoteInput);
      if (dependencies.appliedOperations.has(remote.operationId)) {
        result.duplicates += 1;
        continue;
      }

      const validation = reconcileDeurChanges(undefined, remote);
      if (validation.kind === "invalid") {
        result.rejected += 1;
        continue;
      }

      const localRecord = dependencies.deurs.getById(remote.entity.id);
      if (!localRecord) {
        if (remote.operation === "delete") {
          dependencies.appliedOperations.add(remote.operationId);
          continue;
        }
        const remoteRecord = readRecord(remote);
        if (!remoteRecord) {
          result.rejected += 1;
          continue;
        }
        dependencies.deurs.applyInbound(remoteRecord);
        dependencies.appliedOperations.add(remote.operationId);
        result.applied += 1;
        continue;
      }

      const reconciliation = reconcileDeurChanges(localEnvelope(localRecord, remote), remote);
      if (reconciliation.kind === "merged") {
        const mergedRecord = readRecord(reconciliation.change);
        if (!mergedRecord) {
          result.rejected += 1;
          continue;
        }
        dependencies.deurs.applyInbound(mergedRecord);
        dependencies.appliedOperations.add(remote.operationId);
        result.applied += 1;
        continue;
      }
      if (remote.operation === "delete" && reconciliation.kind === "already-accepted") {
        dependencies.deurs.deleteInbound(remote.entity.id);
        dependencies.appliedOperations.add(remote.operationId);
        result.applied += 1;
        continue;
      }
      if (reconciliation.kind === "already-accepted") {
        dependencies.appliedOperations.add(remote.operationId);
        result.duplicates += 1;
        continue;
      }

      if (reconciliation.kind === "conflict" || reconciliation.kind === "stale-local" || reconciliation.kind === "stale-remote") {
        const classification = reconciliation.kind === "conflict"
          ? reconciliation.reason
          : conflictReason(reconciliation.kind);
        dependencies.conflicts.add({
          id: `${remote.entity.id}:${remote.operationId}:${classification}`,
          entityId: remote.entity.id,
          local: reconciliation.local,
          remote: reconciliation.remote,
          classification,
          detectedAt,
          status: "unresolved",
        });
        dependencies.appliedOperations.add(remote.operationId);
        result.conflicts += 1;
        continue;
      }

      result.rejected += 1;
    }

    dependencies.cursors.save(pulled.cursor);
    return { ...result, success: true, cursor: pulled.cursor };
  } catch (error) {
    return { ...result, error: error instanceof Error ? error.message : "Inbound DEUR processing failed." };
  }
}
