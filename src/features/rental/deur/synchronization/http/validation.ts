import type { DeurSyncChangeEnvelope } from "../types";
import { DEUR_SYNC_PROTOCOL_VERSION, type DeurHttpPullResponse, type DeurHttpPushResponse } from "./types";

const operations = new Set(["create", "update", "delete", "submit", "acknowledge", "reject", "reopen"]);
const rejectionReasons = new Set(["malformed-payload", "unsupported-schema-version", "validation"]);
const conflictReasons = new Set(["competing-activity-edit", "competing-event-edit", "competing-record-edit", "delete-versus-update", "stale-local", "stale-remote"]);

function object(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isDeurSyncEnvelope(value: unknown): value is DeurSyncChangeEnvelope {
  if (!object(value) || value.schemaVersion !== 1 || !object(value.entity)) return false;
  return value.entity.type === "DEUR" && typeof value.entity.id === "string" && value.entity.id.length > 0
    && operations.has(String(value.operation))
    && typeof value.operationId === "string" && value.operationId.length > 0
    && typeof value.idempotencyKey === "string" && value.idempotencyKey.length > 0
    && typeof value.localRevision === "number" && Number.isFinite(value.localRevision)
    && typeof value.baseRemoteRevision === "number" && Number.isFinite(value.baseRemoteRevision)
    && (value.remoteRevision === undefined || typeof value.remoteRevision === "number" && Number.isFinite(value.remoteRevision))
    && typeof value.occurredAt === "string";
}

function accepted(value: unknown): boolean {
  return object(value) && typeof value.operationId === "string" && typeof value.idempotencyKey === "string"
    && typeof value.remoteRevision === "number" && Number.isFinite(value.remoteRevision) && typeof value.alreadyAccepted === "boolean";
}
function rejected(value: unknown): boolean {
  return object(value) && (value.operationId === undefined || typeof value.operationId === "string")
    && rejectionReasons.has(String(value.reason)) && typeof value.message === "string";
}
function conflict(value: unknown): boolean {
  return object(value) && typeof value.operationId === "string" && conflictReasons.has(String(value.reason))
    && typeof value.message === "string" && isDeurSyncEnvelope(value.local) && isDeurSyncEnvelope(value.remote);
}

export function validatePushResponse(value: unknown): DeurHttpPushResponse | undefined {
  if (!object(value) || value.protocolVersion !== DEUR_SYNC_PROTOCOL_VERSION) return undefined;
  if (!Array.isArray(value.accepted) || !value.accepted.every(accepted)
    || !Array.isArray(value.rejected) || !value.rejected.every(rejected)
    || !Array.isArray(value.conflicts) || !value.conflicts.every(conflict)
    || (value.cursor !== undefined && typeof value.cursor !== "string")
    || typeof value.serverTimestamp !== "string") return undefined;
  return structuredClone(value) as unknown as DeurHttpPushResponse;
}

export function validatePullResponse(value: unknown): DeurHttpPullResponse | undefined {
  if (!object(value) || value.protocolVersion !== DEUR_SYNC_PROTOCOL_VERSION) return undefined;
  if (!Array.isArray(value.changes) || !value.changes.every(isDeurSyncEnvelope)
    || typeof value.cursor !== "string" || typeof value.hasMore !== "boolean"
    || typeof value.serverTimestamp !== "string") return undefined;
  return structuredClone(value) as unknown as DeurHttpPullResponse;
}
