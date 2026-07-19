import { beforeEach, describe, expect, it } from "vitest";

import { storage } from "@/core/storage";
import { deurRepository } from "@/features/rental/deur/repository/deurRepository";
import { deurSyncQueue } from "@/features/rental/deur/offline/deurSyncQueue";
import { DeurAppliedOperationRepository } from "@/features/rental/deur/synchronization/inbound/DeurAppliedOperationRepository";
import { DeurConflictRepository } from "@/features/rental/deur/synchronization/inbound/DeurConflictRepository";
import { DeurSyncCursorRepository } from "@/features/rental/deur/synchronization/inbound/DeurSyncCursorRepository";
import { DeurSyncHealthRepository } from "@/features/rental/deur/synchronization/orchestration/DeurSyncHealthRepository";
import { DeurSyncLockRepository } from "@/features/rental/deur/synchronization/orchestration/DeurSyncLockRepository";
import { DeurSyncOrchestrator } from "@/features/rental/deur/synchronization/orchestration/DeurSyncOrchestrator";
import { InMemoryDeurSyncTransport } from "./fakes/InMemoryDeurSyncTransport";

class ManualIntervals {
  private nextId = 1;
  callbacks = new Map<number, () => void>();
  setInterval = (callback: () => void) => { const id = this.nextId++; this.callbacks.set(id, callback); return id; };
  clearInterval = (id: unknown) => { this.callbacks.delete(id as number); };
  tick() { [...this.callbacks.values()].forEach((callback) => callback()); }
}

describe("DEUR synchronization lock renewal", () => {
  beforeEach(() => ["equipment-rental-deur-sync-lock", "equipment-rental-deur-sync-health", "equipment-rental-deur-inbound-cursor", "equipment-rental-deur-sync-queue", "equipment-rental-deur-conflicts"].forEach((key) => storage.remove(key)));

  it("renews only a live lock owned by the requester and retains stale-lock recovery", () => {
    const locks = new DeurSyncLockRepository();
    expect(locks.acquire("owner", new Date("2026-07-19T10:00:00.000Z"))).toBe(true);
    expect(locks.renew("other", new Date("2026-07-19T10:00:20.000Z"))).toBe(false);
    expect(locks.renew("owner", new Date("2026-07-19T10:00:20.000Z"))).toBe(true);
    expect(locks.get()?.expiresAt).toBe("2026-07-19T10:00:50.000Z");
    expect(locks.acquire("replacement", new Date("2026-07-19T10:00:51.000Z"))).toBe(true);
  });

  it("renews during a long cycle and always clears the renewal timer and lock on completion", async () => {
    let current = new Date("2026-07-19T10:00:00.000Z");
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const timers = new ManualIntervals();
    const transport = new InMemoryDeurSyncTransport();
    transport.pull = async (request) => { await gate; return { changes: [], cursor: request.cursor ?? "0", hasMore: false }; };
    const locks = new DeurSyncLockRepository();
    const service = new DeurSyncOrchestrator({
      transport, deurs: deurRepository, queue: deurSyncQueue, cursors: new DeurSyncCursorRepository(), appliedOperations: new DeurAppliedOperationRepository(),
      conflicts: new DeurConflictRepository(), health: new DeurSyncHealthRepository(), locks,
      now: () => current, ownerId: "owner", timers, lockTtlMilliseconds: 30_000, lockRenewalIntervalMilliseconds: 10_000,
    });

    const cycle = service.runCycle();
    current = new Date("2026-07-19T10:00:20.000Z");
    timers.tick();
    expect(locks.get()?.expiresAt).toBe("2026-07-19T10:00:50.000Z");
    expect(timers.callbacks.size).toBe(1);
    release();
    await cycle;
    expect(timers.callbacks.size).toBe(0);
    expect(locks.get()).toBeUndefined();
  });
});
