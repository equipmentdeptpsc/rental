import type {
  DeurConflictReason,
  DeurSyncChangeEnvelope,
  JsonValue,
} from "./types";

type InvalidReason = "malformed-payload" | "unsupported-schema-version";

export type DeurReconciliationResult =
  | { kind: "already-accepted"; change: DeurSyncChangeEnvelope }
  | { kind: "local-only"; change: DeurSyncChangeEnvelope }
  | { kind: "remote-only"; change: DeurSyncChangeEnvelope }
  | { kind: "merged"; change: DeurSyncChangeEnvelope }
  | { kind: "conflict"; reason: DeurConflictReason; local: DeurSyncChangeEnvelope; remote: DeurSyncChangeEnvelope }
  | { kind: "stale-local"; local: DeurSyncChangeEnvelope; remote: DeurSyncChangeEnvelope }
  | { kind: "stale-remote"; local: DeurSyncChangeEnvelope; remote: DeurSyncChangeEnvelope }
  | { kind: "invalid"; reason: InvalidReason; value: unknown };

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validate(value: unknown): { valid: true; change: DeurSyncChangeEnvelope } | { valid: false; reason: InvalidReason } {
  if (!isObject(value)) return { valid: false, reason: "malformed-payload" };
  if (value.schemaVersion !== 1) {
    return { valid: false, reason: typeof value.schemaVersion === "number" ? "unsupported-schema-version" : "malformed-payload" };
  }
  const entity = value.entity;
  if (
    !isObject(entity) || entity.type !== "DEUR" || typeof entity.id !== "string" || !entity.id ||
    typeof value.operationId !== "string" || !value.operationId ||
    typeof value.idempotencyKey !== "string" || !value.idempotencyKey ||
    typeof value.localRevision !== "number" || typeof value.baseRemoteRevision !== "number" ||
    typeof value.occurredAt !== "string" ||
    !["create", "update", "delete", "submit", "acknowledge", "reject", "reopen"].includes(String(value.operation))
  ) return { valid: false, reason: "malformed-payload" };
  return { valid: true, change: structuredClone(value) as unknown as DeurSyncChangeEnvelope };
}

function keyedItems(payload: JsonValue | undefined, key: "logs" | "events"): Map<string, JsonValue> | undefined {
  if (!isObject(payload)) return undefined;
  const items = payload[key];
  if (items === undefined) return new Map();
  if (!Array.isArray(items)) return undefined;
  const result = new Map<string, JsonValue>();
  for (const item of items) {
    if (!isObject(item) || typeof item.id !== "string") return undefined;
    result.set(item.id, item as JsonValue);
  }
  return result;
}

function mergeCollection(local: Map<string, JsonValue>, remote: Map<string, JsonValue>) {
  const merged = new Map(local);
  for (const [id, item] of remote) {
    const existing = merged.get(id);
    if (existing !== undefined && JSON.stringify(existing) !== JSON.stringify(item)) return undefined;
    merged.set(id, item);
  }
  return [...merged.values()];
}

function withoutEvidence(payload: Record<string, unknown>) {
  const { logs: _logs, events: _events, updatedAt: _updatedAt, ...rest } = payload;
  return rest;
}

function conflict(reason: DeurConflictReason, local: DeurSyncChangeEnvelope, remote: DeurSyncChangeEnvelope): DeurReconciliationResult {
  return { kind: "conflict", reason, local, remote };
}

export function reconcileDeurChanges(localValue: unknown, remoteValue: unknown): DeurReconciliationResult {
  const localValidation = localValue === undefined ? undefined : validate(localValue);
  const remoteValidation = remoteValue === undefined ? undefined : validate(remoteValue);
  if (localValidation && !localValidation.valid) return { kind: "invalid", reason: localValidation.reason, value: localValue };
  if (remoteValidation && !remoteValidation.valid) return { kind: "invalid", reason: remoteValidation.reason, value: remoteValue };
  const local = localValidation?.valid ? localValidation.change : undefined;
  const remote = remoteValidation?.valid ? remoteValidation.change : undefined;
  if (!local && !remote) return { kind: "invalid", reason: "malformed-payload", value: undefined };
  if (!remote && local) return { kind: "local-only", change: local };
  if (!local && remote) return { kind: "remote-only", change: remote };
  if (!local || !remote) return { kind: "invalid", reason: "malformed-payload", value: undefined };

  if (local.idempotencyKey === remote.idempotencyKey) return { kind: "already-accepted", change: remote };
  if (local.entity.id !== remote.entity.id) return conflict("competing-record-edit", local, remote);
  if ((local.operation === "delete") !== (remote.operation === "delete")) return conflict("delete-versus-update", local, remote);

  const localLogs = keyedItems(local.payload, "logs");
  const remoteLogs = keyedItems(remote.payload, "logs");
  const localEvents = keyedItems(local.payload, "events");
  const remoteEvents = keyedItems(remote.payload, "events");
  if (!localLogs || !remoteLogs || !localEvents || !remoteEvents) return { kind: "invalid", reason: "malformed-payload", value: !localLogs || !localEvents ? localValue : remoteValue };
  const logs = mergeCollection(localLogs, remoteLogs);
  if (!logs) return conflict("competing-activity-edit", local, remote);
  const events = mergeCollection(localEvents, remoteEvents);
  if (!events) return conflict("competing-event-edit", local, remote);

  const hasNonOverlappingEvidence =
    logs.length > Math.max(localLogs.size, remoteLogs.size) ||
    events.length > Math.max(localEvents.size, remoteEvents.size);

  if (
    hasNonOverlappingEvidence &&
    isObject(local.payload) &&
    isObject(remote.payload) &&
    JSON.stringify(withoutEvidence(local.payload)) === JSON.stringify(withoutEvidence(remote.payload))
  ) {
    return {
      kind: "merged",
      change: {
        ...local,
        localRevision: Math.max(local.localRevision, remote.localRevision),
        baseRemoteRevision: Math.max(local.baseRemoteRevision, remote.baseRemoteRevision),
        remoteRevision: Math.max(local.remoteRevision ?? 0, remote.remoteRevision ?? 0),
        payload: { ...(structuredClone(local.payload) as Record<string, JsonValue>), logs, events },
      },
    };
  }

  const remoteRevision = remote.remoteRevision ?? 0;
  if (local.baseRemoteRevision < remoteRevision) return { kind: "stale-local", local, remote };
  if (local.baseRemoteRevision > remoteRevision) return { kind: "stale-remote", local, remote };
  return conflict("competing-record-edit", local, remote);
}
