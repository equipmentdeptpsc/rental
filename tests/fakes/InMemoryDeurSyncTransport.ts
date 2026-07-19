import type {
  DeurConflictResult,
  DeurPullRequest,
  DeurPullResult,
  DeurPushRequest,
  DeurPushResult,
  DeurRemoteSyncTransport,
  DeurSyncChangeEnvelope,
  DeurTransportErrorClassification,
} from "@/features/rental/deur/synchronization/types";

export class InMemoryDeurSyncTransport implements DeurRemoteSyncTransport {
  private changes: DeurSyncChangeEnvelope[] = [];
  private accepted = new Map<string, number>();
  private nextFailure?: { classification: DeurTransportErrorClassification; message: string };
  private nextConflict?: DeurSyncChangeEnvelope;

  async push(request: DeurPushRequest): Promise<DeurPushResult> {
    const snapshot = structuredClone(request);
    if (this.nextFailure) {
      const failure = this.nextFailure;
      this.nextFailure = undefined;
      return {
        accepted: [], rejected: [], conflicts: [], cursor: String(this.changes.length),
        transportError: { ...failure, retryable: ["network", "timeout", "unavailable"].includes(failure.classification) },
      };
    }

    const accepted: DeurPushResult["accepted"] = [];
    const conflicts: DeurConflictResult[] = [];
    for (const change of snapshot.changes) {
      if (this.nextConflict) {
        conflicts.push({
          operationId: change.operationId,
          reason: "competing-record-edit",
          message: "Simulated remote revision conflict.",
          local: change,
          remote: structuredClone(this.nextConflict),
        });
        this.nextConflict = undefined;
        continue;
      }
      const priorRevision = this.accepted.get(change.idempotencyKey);
      if (priorRevision !== undefined) {
        accepted.push({ operationId: change.operationId, idempotencyKey: change.idempotencyKey, remoteRevision: priorRevision, alreadyAccepted: true });
        continue;
      }
      const remoteRevision = this.changes.length + 1;
      this.changes.push({ ...structuredClone(change), remoteRevision });
      this.accepted.set(change.idempotencyKey, remoteRevision);
      accepted.push({ operationId: change.operationId, idempotencyKey: change.idempotencyKey, remoteRevision, alreadyAccepted: false });
    }
    return { accepted, rejected: [], conflicts, cursor: String(this.changes.length) };
  }

  async pull(request: DeurPullRequest): Promise<DeurPullResult> {
    const offset = Math.max(0, Number.parseInt(request.cursor ?? "0", 10) || 0);
    const limit = request.limit ?? this.changes.length;
    const changes = this.changes.slice(offset, offset + limit).map((change) => structuredClone(change));
    const cursor = String(offset + changes.length);
    return { changes, cursor, hasMore: Number(cursor) < this.changes.length };
  }

  simulateRemoteChange(change: DeurSyncChangeEnvelope): void {
    const snapshot = structuredClone(change);
    const remoteRevision = this.changes.length + 1;
    this.changes.push({ ...snapshot, remoteRevision });
    this.accepted.set(snapshot.idempotencyKey, remoteRevision);
  }

  simulateConflict(remote: DeurSyncChangeEnvelope): void {
    this.nextConflict = structuredClone(remote);
  }

  failNext(classification: DeurTransportErrorClassification, message: string): void {
    this.nextFailure = { classification, message };
  }

  getStoredChanges(): DeurSyncChangeEnvelope[] {
    return structuredClone(this.changes);
  }
}
