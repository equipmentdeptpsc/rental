import {
  compareOfflineCommands,
  validateOfflineOperationalCommand,
  type OfflineCommandFailureClassification,
  type OfflineCommandScope,
  type OfflineOperationalCommand,
  type OfflineOperationalCommandQueue,
} from "./offlineQueue";

export class InMemoryOfflineOperationalCommandQueue implements OfflineOperationalCommandQueue {
  private readonly records: Map<string, OfflineOperationalCommand>;
  private readonly listeners = new Set<(scope: OfflineCommandScope) => void>();

  constructor(records: Map<string, OfflineOperationalCommand> = new Map()) {
    this.records = records;
  }

  private notify(record: OfflineOperationalCommand): void {
    this.listeners.forEach((listener) => listener({ tenantId: record.tenantId, operatorId: record.operatorId ?? "" }));
  }

  async enqueue(command: OfflineOperationalCommand): Promise<"ENQUEUED" | "DUPLICATE"> {
    validateOfflineOperationalCommand(command);
    if ([...this.records.values()].some((item) => item.idempotencyKey === command.idempotencyKey)) return "DUPLICATE";
    this.records.set(command.id, structuredClone(command));
    this.notify(command);
    return "ENQUEUED";
  }
  async findById(id: string) { const value = this.records.get(id); return value && structuredClone(value); }
  async listPending(scope: OfflineCommandScope) {
    return [...this.records.values()]
      .filter((item) => item.tenantId === scope.tenantId && item.operatorId === scope.operatorId && item.status !== "TERMINAL_FAILURE")
      .sort(compareOfflineCommands).map((item) => structuredClone(item));
  }
  async listTerminal(scope: OfflineCommandScope) {
    return [...this.records.values()]
      .filter((item) => item.tenantId === scope.tenantId && item.operatorId === scope.operatorId && item.status === "TERMINAL_FAILURE")
      .sort(compareOfflineCommands).map((item) => structuredClone(item));
  }
  async claimForReplay(id: string, ownerId: string, expiresAt: string, now: string) {
    const item = this.records.get(id);
    if (!item || item.status === "TERMINAL_FAILURE" || (item.claim && item.claim.expiresAt > now && item.claim.ownerId !== ownerId)) return undefined;
    const claimed: OfflineOperationalCommand = { ...item, status: "CLAIMED", claim: { ownerId, expiresAt } };
    this.records.set(id, claimed); this.notify(claimed); return structuredClone(claimed);
  }
  async markSucceeded(id: string, ownerId: string) {
    const item = this.records.get(id); if (!item || item.claim?.ownerId !== ownerId) return;
    this.records.delete(id); this.notify(item);
  }
  async markRetryableFailure(id: string, ownerId: string, failureClassification: OfflineCommandFailureClassification, nextAttemptAt: string, lastAttemptAt: string) {
    const item = this.records.get(id); if (!item || item.claim?.ownerId !== ownerId) return;
    const updated = { ...item, status: "RETRYABLE_FAILURE" as const, claim: undefined, failureClassification, nextAttemptAt, lastAttemptAt, attemptCount: item.attemptCount + 1 };
    this.records.set(id, updated); this.notify(updated);
  }
  async markTerminalFailure(id: string, ownerId: string, failureClassification: OfflineCommandFailureClassification, lastAttemptAt: string) {
    const item = this.records.get(id); if (!item || item.claim?.ownerId !== ownerId) return;
    const updated = { ...item, status: "TERMINAL_FAILURE" as const, claim: undefined, failureClassification, lastAttemptAt, attemptCount: item.attemptCount + 1 };
    this.records.set(id, updated); this.notify(updated);
  }
  async releaseExpiredClaims(now: string, scope: OfflineCommandScope) {
    let count = 0;
    for (const item of await this.listPending(scope)) if (item.claim && item.claim.expiresAt <= now) {
      this.records.set(item.id, { ...item, status: "PENDING", claim: undefined }); count += 1;
    }
    return count;
  }
  async deleteAcknowledged(id: string) { this.records.delete(id); }
  async clearTestFixtures(scope: OfflineCommandScope, idPrefix: string) {
    let count = 0;
    for (const item of [...this.records.values()]) if (item.tenantId === scope.tenantId && item.operatorId === scope.operatorId && item.id.startsWith(idPrefix)) {
      this.records.delete(item.id); count += 1;
    }
    return count;
  }
  observe(listener: (scope: OfflineCommandScope) => void) { this.listeners.add(listener); return () => this.listeners.delete(listener); }
}
