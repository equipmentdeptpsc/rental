import { beforeEach, describe, expect, it, vi } from "vitest";

import { storage } from "@/core/storage";
import { deurRepository } from "@/features/rental/deur/repository/deurRepository";
import { deurSyncQueue } from "@/features/rental/deur/offline/deurSyncQueue";
import { DeurSyncHealthRepository } from "@/features/rental/deur/synchronization/orchestration/DeurSyncHealthRepository";
import { DeurSyncLockRepository } from "@/features/rental/deur/synchronization/orchestration/DeurSyncLockRepository";
import { DeurSyncOrchestrator } from "@/features/rental/deur/synchronization/orchestration/DeurSyncOrchestrator";
import type { DeurSyncHealth } from "@/features/rental/deur/synchronization/orchestration/types";
import type { DeurRemoteSyncTransport, DeurSyncChangeEnvelope, JsonValue } from "@/features/rental/deur/synchronization/types";
import { DeurAppliedOperationRepository } from "@/features/rental/deur/synchronization/inbound/DeurAppliedOperationRepository";
import { DeurConflictRepository } from "@/features/rental/deur/synchronization/inbound/DeurConflictRepository";
import { DeurSyncCursorRepository } from "@/features/rental/deur/synchronization/inbound/DeurSyncCursorRepository";
import type { DeurRecord } from "@/features/rental/deur/types";
import { InMemoryDeurSyncTransport } from "./fakes/InMemoryDeurSyncTransport";

const KEYS = [
  "equipment-rental-deur", "equipment-rental-deur-sync-queue", "equipment-rental-deur-inbound-cursor",
  "equipment-rental-deur-applied-operations", "equipment-rental-deur-conflicts",
  "equipment-rental-deur-sync-health", "equipment-rental-deur-sync-lock",
];

function record(): DeurRecord {
  return {
    id: "deur-1", rentalId: "rental-1", equipmentId: "equipment-1", operatorId: "operator-1", workDate: "2026-07-19",
    logs: [], totalOperatingMinutes: 0, totalIdleMinutes: 0, totalMaintenanceMinutes: 0, totalMealBreakMinutes: 0,
    totalMobilizationMinutes: 0, totalDemobilizationMinutes: 0, status: "In Progress",
    createdAt: "2026-07-19T08:00:00.000Z", updatedAt: "2026-07-19T08:00:00.000Z",
  };
}

function json(value: unknown): JsonValue { return JSON.parse(JSON.stringify(value)) as JsonValue; }
function remoteChange(): DeurSyncChangeEnvelope {
  return {
    schemaVersion: 1, entity: { type: "DEUR", id: "deur-2" }, operation: "create", operationId: "remote-1",
    idempotencyKey: "remote-1", localRevision: 1, baseRemoteRevision: 0, remoteRevision: 1,
    occurredAt: "2026-07-19T09:00:00.000Z", payload: json({ ...record(), id: "deur-2" }),
  };
}

function enqueue(id = "outbound-1") {
  deurSyncQueue.enqueue({ id, aggregateId: "deur-1", aggregateType: "DEUR", operation: "update", payload: json(record()), createdAt: "2026-07-19T08:00:00.000Z" });
}

class RecordingHealthRepository extends DeurSyncHealthRepository {
  readonly transitions: DeurSyncHealth[] = [];
  override save(health: DeurSyncHealth): void {
    this.transitions.push(structuredClone(health));
    super.save(health);
  }
}

function orchestrator(transport?: DeurRemoteSyncTransport, health = new RecordingHealthRepository(), now = () => new Date("2026-07-19T10:00:00.000Z")) {
  return {
    health,
    service: new DeurSyncOrchestrator({
      transport, deurs: deurRepository, queue: deurSyncQueue, cursors: new DeurSyncCursorRepository(),
      appliedOperations: new DeurAppliedOperationRepository(), conflicts: new DeurConflictRepository(),
      health, locks: new DeurSyncLockRepository(), now, ownerId: "test-owner",
    }),
  };
}

describe("Digital DEUR synchronization orchestrator", () => {
  beforeEach(() => KEYS.forEach((key) => storage.remove(key)));

  it("runs accepted outbound work before inbound pull and does not resend it next cycle", async () => {
    const order: string[] = [];
    const base = new InMemoryDeurSyncTransport();
    base.simulateRemoteChange(remoteChange());
    const transport: DeurRemoteSyncTransport = {
      push: async (request) => { order.push("outbound"); return base.push(request); },
      pull: async (request) => { order.push("inbound"); return base.pull(request); },
    };
    enqueue();
    const { service } = orchestrator(transport);

    await service.runCycle();
    await service.runCycle();

    expect(order).toEqual(["outbound", "inbound", "inbound"]);
    expect(deurSyncQueue.getAll()[0].status).toBe("synced");
  });

  it("does not start inbound when outbound temporarily fails and releases its lock", async () => {
    const transport = new InMemoryDeurSyncTransport();
    transport.failNext("network", "offline");
    enqueue();
    const { service } = orchestrator(transport);

    const result = await service.runCycle();

    expect(result.health).toMatchObject({ status: "failed-retryable", running: false, pendingOutboundCount: 1 });
    expect(transport.getPullRequests()).toEqual([]);
    expect(deurSyncQueue.getAll()[0].status).toBe("failed");
    expect(new DeurSyncLockRepository().get()).toBeUndefined();
  });

  it("preserves the inbound cursor after a temporary inbound failure", async () => {
    const transport = new InMemoryDeurSyncTransport();
    const cursors = new DeurSyncCursorRepository();
    cursors.save("4");
    transport.failNext("timeout", "later");
    const { service } = orchestrator(transport);

    const result = await service.runCycle();

    expect(result.health.status).toBe("failed-retryable");
    expect(cursors.get()).toBe("4");
  });

  it("shares a same-tab active cycle so concurrent callers never overlap", async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const transport = new InMemoryDeurSyncTransport();
    const pull = vi.spyOn(transport, "pull").mockImplementation(async (request) => { await gate; return { changes: [], cursor: request.cursor ?? "0", hasMore: false }; });
    const { service } = orchestrator(transport);

    const first = service.runCycle();
    const second = service.runCycle();
    await Promise.resolve();
    expect(pull).toHaveBeenCalledOnce();
    release();
    await Promise.all([first, second]);
    expect(pull).toHaveBeenCalledOnce();
  });

  it("recovers a stale cross-tab lock and releases it after success", async () => {
    storage.set("equipment-rental-deur-sync-lock", { ownerId: "dead-tab", acquiredAt: "2026-07-19T09:00:00.000Z", expiresAt: "2026-07-19T09:01:00.000Z" });
    const { service } = orchestrator(new InMemoryDeurSyncTransport());

    expect((await service.runCycle()).started).toBe(true);
    expect(new DeurSyncLockRepository().get()).toBeUndefined();
  });

  it("persists ordered health transitions, counts, and resets consecutive failures after success", async () => {
    const health = new RecordingHealthRepository();
    const transport = new InMemoryDeurSyncTransport();
    enqueue();
    transport.failNext("network", "offline");
    const { service } = orchestrator(transport, health);
    await service.runCycle();
    expect(service.getHealth()).toMatchObject({ status: "failed-retryable", consecutiveFailureCount: 1, pendingOutboundCount: 1 });

    await service.runCycle();
    expect(health.transitions.map((item) => item.status)).toContain("running-outbound");
    expect(health.transitions.map((item) => item.status)).toContain("running-inbound");
    expect(service.getHealth()).toMatchObject({ status: "completed", consecutiveFailureCount: 0, pendingOutboundCount: 0 });
    expect(new DeurSyncHealthRepository().get().lastSuccessfulCompletion).toBe("2026-07-19T10:00:00.000Z");
  });

  it("classifies non-retryable failures and reports unresolved conflicts", async () => {
    const transport = new InMemoryDeurSyncTransport();
    enqueue();
    transport.failNext("unauthorized", "credentials rejected");
    const first = orchestrator(transport);
    expect((await first.service.runCycle()).health).toMatchObject({ status: "failed-non-retryable", lastFailureClassification: "unauthorized" });

    storage.remove("equipment-rental-deur-sync-queue");
    new DeurConflictRepository().add({
      id: "conflict-1", entityId: "deur-1", local: remoteChange(), remote: remoteChange(),
      classification: "competing-activity-edit", detectedAt: "2026-07-19T09:00:00.000Z", status: "unresolved",
    });
    const second = orchestrator(new InMemoryDeurSyncTransport());
    expect((await second.service.runCycle()).health).toMatchObject({ status: "blocked-by-conflict", unresolvedConflictCount: 1 });
  });

  it("reports unconfigured remote sync without blocking local repository operations", async () => {
    const { service } = orchestrator(undefined);
    const input = record();
    deurRepository.create(input);

    const result = await service.runCycle();

    expect(result).toMatchObject({ started: false, health: { status: "disabled-unconfigured", running: false } });
    expect(deurRepository.getById(input.id)).toBeDefined();
  });
});
