import type { DeurRecord } from "../../types";
import { createQueueTransportAdapter } from "../createQueueTransportAdapter";
import type { DeurRemoteSyncTransport, DeurTransportErrorClassification } from "../types";
import { synchronizeInboundDeur } from "../inbound/synchronizeInboundDeur";
import type { DeurAppliedOperationRepository } from "../inbound/DeurAppliedOperationRepository";
import type { DeurConflictRepository } from "../inbound/DeurConflictRepository";
import type { DeurSyncCursorRepository } from "../inbound/DeurSyncCursorRepository";
import { processDeurSyncQueue } from "../../offline/syncCoordinator";
import type { DeurQueueItem } from "../../offline/types";
import type { DeurSyncHealth } from "./types";
import type { DeurSyncHealthRepository } from "./DeurSyncHealthRepository";
import type { DeurSyncLockRepository } from "./DeurSyncLockRepository";

interface QueuePort {
  countPending(): number;
  getAll(): DeurQueueItem[];
}

interface DeurPort {
  getById(id: string): DeurRecord | undefined;
  applyInbound(record: DeurRecord): DeurRecord;
  deleteInbound(id: string): boolean;
}

export interface DeurSyncOrchestratorDependencies {
  transport?: DeurRemoteSyncTransport;
  deurs: DeurPort;
  queue: QueuePort;
  cursors: DeurSyncCursorRepository;
  appliedOperations: DeurAppliedOperationRepository;
  conflicts: DeurConflictRepository;
  health: DeurSyncHealthRepository;
  locks: DeurSyncLockRepository;
  now?: () => Date;
  ownerId?: string;
  timers?: { setInterval(callback: () => void, milliseconds: number): unknown; clearInterval(handle: unknown): void };
  lockTtlMilliseconds?: number;
  lockRenewalIntervalMilliseconds?: number;
}

export interface DeurSyncCycleResult {
  started: boolean;
  outboundProcessed: number;
  inboundApplied: number;
  health: DeurSyncHealth;
}

let activeCycle: Promise<DeurSyncCycleResult> | undefined;

export class DeurSyncOrchestrator {
  private readonly now: () => Date;
  private readonly ownerId: string;
  private readonly timers: { setInterval(callback: () => void, milliseconds: number): unknown; clearInterval(handle: unknown): void };
  private readonly lockTtlMilliseconds: number;
  private readonly lockRenewalIntervalMilliseconds: number;

  constructor(private readonly dependencies: DeurSyncOrchestratorDependencies) {
    this.now = dependencies.now ?? (() => new Date());
    this.ownerId = dependencies.ownerId ?? crypto.randomUUID();
    this.timers = dependencies.timers ?? {
      setInterval: (callback, milliseconds) => window.setInterval(callback, milliseconds),
      clearInterval: (handle) => window.clearInterval(handle as number),
    };
    this.lockTtlMilliseconds = dependencies.lockTtlMilliseconds ?? 30_000;
    this.lockRenewalIntervalMilliseconds = dependencies.lockRenewalIntervalMilliseconds ?? 10_000;
    if (!dependencies.transport) {
      dependencies.health.save(this.snapshot("disabled-unconfigured", { running: false }));
    }
  }

  isConfigured(): boolean { return Boolean(this.dependencies.transport); }

  getHealth(): DeurSyncHealth {
    return this.dependencies.health.get();
  }

  runCycle(): Promise<DeurSyncCycleResult> {
    if (activeCycle) return activeCycle;
    activeCycle = this.executeCycle();
    void activeCycle.finally(() => { activeCycle = undefined; });
    return activeCycle;
  }

  private snapshot(status: DeurSyncHealth["status"], overrides: Partial<DeurSyncHealth> = {}): DeurSyncHealth {
    const previous = this.dependencies.health.get();
    return {
      ...previous,
      status,
      pendingOutboundCount: this.dependencies.queue.countPending(),
      unresolvedConflictCount: this.dependencies.conflicts.getAll().filter((item) => item.status === "unresolved").length,
      lastInboundCursor: this.dependencies.cursors.get(),
      ...overrides,
    };
  }

  private save(status: DeurSyncHealth["status"], overrides: Partial<DeurSyncHealth> = {}): DeurSyncHealth {
    const health = this.snapshot(status, overrides);
    this.dependencies.health.save(health);
    return health;
  }

  private failure(
    message: string,
    classification: string | undefined,
    retryable: boolean,
    partiallyCompleted: boolean,
  ): DeurSyncHealth {
    const previous = this.dependencies.health.get();
    const status = partiallyCompleted ? "partially-completed" : retryable ? "failed-retryable" : "failed-non-retryable";
    const knownClassification = (classification ?? "unknown") as DeurTransportErrorClassification | "validation" | "conflict";
    return this.save(status, {
      running: false,
      lastFailure: message,
      lastFailureClassification: knownClassification,
      consecutiveFailureCount: previous.consecutiveFailureCount + 1,
      nextRetryEligibleAt: retryable ? new Date(this.now().getTime() + 30_000).toISOString() : undefined,
    });
  }

  private async executeCycle(): Promise<DeurSyncCycleResult> {
    const { transport } = this.dependencies;
    if (!transport) {
      const health = this.save("disabled-unconfigured", { running: false });
      return { started: false, outboundProcessed: 0, inboundApplied: 0, health };
    }

    const startedAt = this.now();
    if (!this.dependencies.locks.acquire(this.ownerId, startedAt, this.lockTtlMilliseconds)) {
      return { started: false, outboundProcessed: 0, inboundApplied: 0, health: this.getHealth() };
    }

    let outboundProcessed = 0;
    let inboundApplied = 0;
    const renewalTimer = this.timers.setInterval(
      () => { this.dependencies.locks.renew(this.ownerId, this.now(), this.lockTtlMilliseconds); },
      this.lockRenewalIntervalMilliseconds,
    );
    try {
      this.save("running-outbound", { running: true, lastCycleStart: startedAt.toISOString() });
      const outbound = await processDeurSyncQueue(createQueueTransportAdapter(transport));
      outboundProcessed = outbound.processed;
      const blocked = this.dependencies.queue.getAll().find((item) => item.status === "conflict");
      if (blocked) {
        const health = this.save("blocked-by-conflict", {
          running: false,
          lastFailure: blocked.error ?? "Outbound DEUR conflict requires review.",
          lastFailureClassification: "conflict",
          consecutiveFailureCount: this.getHealth().consecutiveFailureCount + 1,
        });
        return { started: true, outboundProcessed, inboundApplied, health };
      }
      const failed = this.dependencies.queue.getAll().find((item) => item.status === "failed");
      if (failed) {
        const health = this.failure(failed.error ?? "Outbound synchronization failed.", failed.errorClassification, failed.retryable ?? true, false);
        return { started: true, outboundProcessed, inboundApplied, health };
      }

      this.save("running-inbound", { running: true });
      const inbound = await synchronizeInboundDeur({
        transport,
        deurs: this.dependencies.deurs,
        cursors: this.dependencies.cursors,
        appliedOperations: this.dependencies.appliedOperations,
        conflicts: this.dependencies.conflicts,
      }, this.now().toISOString());
      inboundApplied = inbound.applied;
      if (!inbound.success) {
        const health = this.failure(
          inbound.error ?? "Inbound synchronization failed.",
          inbound.errorClassification,
          inbound.retryable ?? true,
          outboundProcessed > 0,
        );
        return { started: true, outboundProcessed, inboundApplied, health };
      }

      const unresolved = this.dependencies.conflicts.getAll().filter((item) => item.status === "unresolved").length;
      const completedAt = this.now().toISOString();
      const health = this.save(unresolved > 0 ? "blocked-by-conflict" : "completed", {
        running: false,
        lastSuccessfulCompletion: completedAt,
        lastFailure: undefined,
        lastFailureClassification: undefined,
        consecutiveFailureCount: 0,
        nextRetryEligibleAt: undefined,
      });
      return { started: true, outboundProcessed, inboundApplied, health };
    } catch (error) {
      const health = this.failure(error instanceof Error ? error.message : "Synchronization cycle failed.", "unknown", true, outboundProcessed > 0);
      return { started: true, outboundProcessed, inboundApplied, health };
    } finally {
      this.timers.clearInterval(renewalTimer);
      this.dependencies.locks.release(this.ownerId);
    }
  }
}
