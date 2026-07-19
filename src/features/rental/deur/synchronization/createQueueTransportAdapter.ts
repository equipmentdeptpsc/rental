import type { DeurSyncTransport } from "../offline/deurSyncTransport";
import type { DeurQueueItem } from "../offline/types";
import type { DeurRemoteSyncTransport, DeurSyncChangeEnvelope, JsonValue } from "./types";

function serializablePayload(value: unknown): JsonValue | undefined {
  if (value === undefined) return undefined;
  return JSON.parse(JSON.stringify(value)) as JsonValue;
}

function toEnvelope(item: DeurQueueItem): DeurSyncChangeEnvelope {
  return {
    schemaVersion: 1,
    entity: { type: "DEUR", id: item.aggregateId },
    operation: item.operation,
    operationId: item.id,
    idempotencyKey: item.id,
    localRevision: item.retryCount + 1,
    baseRemoteRevision: 0,
    occurredAt: item.createdAt,
    payload: serializablePayload(item.payload),
  };
}

/** Adapts the existing one-item FIFO coordinator to the batch-capable remote port. */
export function createQueueTransportAdapter(remote: DeurRemoteSyncTransport): DeurSyncTransport {
  return {
    async push(item) {
      const result = await remote.push({ changes: [toEnvelope(item)] });
      if (result.transportError) return { success: false, error: result.transportError.message };
      const conflict = result.conflicts.find((entry) => entry.operationId === item.id);
      if (conflict) return { success: false, conflict: true, error: conflict.message };
      const rejected = result.rejected.find((entry) => entry.operationId === item.id);
      if (rejected) return { success: false, error: rejected.message };
      return result.accepted.some((entry) => entry.operationId === item.id)
        ? { success: true }
        : { success: false, error: "Transport did not confirm the DEUR change." };
    },
  };
}
