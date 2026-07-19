import type { DeurConflictResult, DeurSyncChangeEnvelope } from "../../../src/features/rental/deur/synchronization/types";
import type { DeurSyncServerPersistence, ServerEntityState } from "../persistence/DeurSyncServerPersistence";
import type { DeurSyncServerApplication, ServerPullQuery, ServerPullResult, ServerPushCommand, ServerPushResult } from "./types";

export class DeurSyncServerValidationError extends Error {}

export class DeurSyncServerService implements DeurSyncServerApplication {
  constructor(private readonly persistence: DeurSyncServerPersistence, private readonly now: () => Date = () => new Date()) {}

  async push(command: ServerPushCommand): Promise<ServerPushResult> {
    const accepted: ServerPushResult["accepted"] = [], rejected: ServerPushResult["rejected"] = [], conflicts: ServerPushResult["conflicts"] = [];
    for (const input of structuredClone(command.changes)) {
      const replay = await this.persistence.findByOperationId(input.operationId) ?? await this.persistence.findByIdempotencyKey(input.idempotencyKey);
      if (replay) {
        accepted.push({ operationId: input.operationId, idempotencyKey: input.idempotencyKey, remoteRevision: replay.remoteRevision, alreadyAccepted: true });
        continue;
      }
      const current = await this.persistence.getEntityState(input.entity.id);
      const currentRevision = current?.revision ?? 0;
      if (input.baseRemoteRevision > currentRevision) {
        rejected.push({ operationId: input.operationId, reason: "validation", message: "The base remote revision is in the future." });
        continue;
      }
      if (input.baseRemoteRevision < currentRevision && current) {
        conflicts.push(await this.staleConflict(input, current));
        continue;
      }
      const result = await this.persistence.accept({ change: input, expectedRevision: input.baseRemoteRevision });
      if (result.kind === "replayed") {
        accepted.push({ operationId: input.operationId, idempotencyKey: input.idempotencyKey, remoteRevision: result.accepted.remoteRevision, alreadyAccepted: true });
      } else if (result.kind === "revision-mismatch") {
        if (input.baseRemoteRevision > result.currentRevision || !result.current) rejected.push({ operationId: input.operationId, reason: "validation", message: "The base remote revision is invalid." });
        else conflicts.push(await this.staleConflict(input, result.current));
      } else {
        accepted.push({ operationId: input.operationId, idempotencyKey: input.idempotencyKey, remoteRevision: result.accepted.remoteRevision, alreadyAccepted: false });
      }
    }
    return { accepted, rejected, conflicts, cursor: String((await this.persistence.readChanges(0, 0)).total), serverTimestamp: this.now().toISOString() };
  }

  async pull(query: ServerPullQuery): Promise<ServerPullResult> {
    const rawCursor = query.cursor ?? "0";
    if (!/^\d+$/.test(rawCursor)) throw new DeurSyncServerValidationError("Invalid synchronization cursor.");
    const cursor = Number(rawCursor);
    const total = (await this.persistence.readChanges(0, 0)).total;
    if (!Number.isSafeInteger(cursor) || cursor < 0 || cursor > total) throw new DeurSyncServerValidationError("Invalid synchronization cursor.");
    const limit = query.limit ?? total;
    if (!Number.isSafeInteger(limit) || limit < 0) throw new DeurSyncServerValidationError("Invalid pull limit.");
    const page = await this.persistence.readChanges(cursor, limit);
    const next = page.nextCursor ?? cursor + page.changes.length;
    return { changes: page.changes, cursor: String(next), hasMore: next < page.total, serverTimestamp: this.now().toISOString() };
  }

  private async staleConflict(local: DeurSyncChangeEnvelope, current: ServerEntityState): Promise<DeurConflictResult> {
    const conflict: DeurConflictResult = { operationId: local.operationId, reason: "stale-local", message: "The submitted DEUR revision is stale.", local: structuredClone(local), remote: structuredClone(current.latest) };
    await this.persistence.recordConflict({ ...conflict, id: `${local.entity.id}:${local.operationId}:stale-local` });
    return conflict;
  }
}
