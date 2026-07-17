import { beforeEach, describe, expect, it, vi } from "vitest";
import { storage } from "@/core/storage";
import type { DeurRecord } from "@/features/rental/deur/types";

const DEUR_KEY = "equipment-rental-deur";
const QUEUE_KEY = "equipment-rental-deur-sync-queue";

function buildRecord(id = "deur-1"): DeurRecord {
  return {
    id,
    rentalId: "rental-1",
    equipmentId: "equipment-1",
    operatorId: "operator-1",
    workDate: "2026-01-01",
    logs: [],
    totalOperatingMinutes: 0,
    totalIdleMinutes: 0,
    totalMaintenanceMinutes: 0,
    totalMealBreakMinutes: 0,
    totalMobilizationMinutes: 0,
    totalDemobilizationMinutes: 0,
    status: "In Progress",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    legacy: false,
    events: [
      { id: "event-1", activityType: "shift", action: "start", timestamp: "2026-01-01T00:00:00.000Z", sequence: 1, source: "user" },
      { id: "event-2", activityType: "operation", action: "start", timestamp: "2026-01-01T01:00:00.000Z", sequence: 2, source: "user" },
      { id: "event-3", activityType: "operation", action: "end", timestamp: "2026-01-01T02:00:00.000Z", sequence: 3, source: "user" },
      { id: "event-4", activityType: "shift", action: "end", timestamp: "2026-01-01T03:00:00.000Z", sequence: 4, source: "user" },
    ],
  };
}

async function loadRepository() {
  const { deurRepository } = await import("@/features/rental/deur/repository/deurRepository");
  const { deurSyncQueue } = await import("@/features/rental/deur/offline/deurSyncQueue");
  return { deurRepository, deurSyncQueue };
}

describe("DEUR repository offline queue integration", () => {
  beforeEach(() => {
    storage.remove(DEUR_KEY);
    storage.remove(QUEUE_KEY);
    vi.resetModules();
  });

  it("enqueues exactly one create mutation with a serializable, stable aggregate payload", async () => {
    const { deurRepository, deurSyncQueue } = await loadRepository();
    const input = buildRecord();
    const original = structuredClone(input);

    const created = deurRepository.create(input);

    expect(input).toEqual(original);
    expect(deurSyncQueue.getAll()).toHaveLength(1);
    expect(deurSyncQueue.getAll()[0]).toMatchObject({
      aggregateId: created.id,
      aggregateType: "DEUR",
      operation: "create",
      status: "pending",
      retryCount: 0,
    });
    expect(() => JSON.stringify(deurSyncQueue.getAll()[0].payload)).not.toThrow();
  });

  it("enqueues exactly one update mutation and does not enqueue reads or a missing update", async () => {
    const { deurRepository, deurSyncQueue } = await loadRepository();
    const created = deurRepository.create(buildRecord());
    const beforeUpdate = deurSyncQueue.getAll().length;

    deurRepository.update({ ...created, acknowledgementRemarks: "corrected" });
    expect(deurRepository.getById(created.id)?.acknowledgementRemarks).toBe("corrected");
    expect(deurSyncQueue.getAll()).toHaveLength(beforeUpdate + 1);
    expect(deurSyncQueue.getAll().at(-1)).toMatchObject({ operation: "update", aggregateId: created.id });

    deurRepository.getAll();
    deurRepository.getById(created.id);
    deurRepository.getByRentalId(created.rentalId);
    expect(deurSyncQueue.getAll()).toHaveLength(beforeUpdate + 1);

    deurRepository.update({ ...created, id: "missing-deur" });
    expect(deurSyncQueue.getAll()).toHaveLength(beforeUpdate + 1);
  });

  it("enqueues delete once with the minimum replay payload and ignores a missing record", async () => {
    const { deurRepository, deurSyncQueue } = await loadRepository();
    const created = deurRepository.create(buildRecord());

    const deleted = deurRepository.delete(created.id);
    expect(deleted?.id).toBe(created.id);
    expect(deurRepository.getById(created.id)).toBeUndefined();
    expect(deurSyncQueue.getAll().at(-1)).toMatchObject({ operation: "delete", aggregateId: created.id, payload: { id: created.id } });

    const count = deurSyncQueue.getAll().length;
    expect(deurRepository.delete("missing-deur")).toBeUndefined();
    expect(deurSyncQueue.getAll()).toHaveLength(count);
  });

  it("enqueues submit, reject, and reopen once in FIFO order without update mutations", async () => {
    const { deurRepository, deurSyncQueue } = await loadRepository();
    const created = deurRepository.create(buildRecord());

    expect(deurRepository.submit(created.id, { name: "Admin" }).success).toBe(true);
    expect(deurRepository.reject(created.id, { name: "Admin" }, "Correct the hours").success).toBe(true);
    expect(deurRepository.reopen(created.id, { name: "Admin" }).success).toBe(true);

    expect(deurSyncQueue.getAll().map((item) => item.operation)).toEqual([
      "create", "submit", "reject", "reopen",
    ]);
    expect(deurRepository.submit("missing-deur", { name: "Admin" }).success).toBe(false);
    expect(deurSyncQueue.getAll()).toHaveLength(4);
  });

  it("enqueues acknowledge exactly once and does not enqueue a rejected repeat acknowledgement", async () => {
    const { deurRepository, deurSyncQueue } = await loadRepository();
    const created = deurRepository.create(buildRecord());
    expect(deurRepository.submit(created.id, { name: "Admin" }).success).toBe(true);
    const count = deurSyncQueue.getAll().length;

    expect(deurRepository.acknowledge(created.id, { name: "Admin" }).success).toBe(true);
    expect(deurRepository.getById(created.id)?.status).toBe("Acknowledged");
    expect(deurSyncQueue.getAll().slice(count).map((item) => item.operation)).toEqual(["acknowledge"]);
    expect(deurRepository.acknowledge(created.id, { name: "Admin" }).success).toBe(false);
    expect(deurSyncQueue.getAll()).toHaveLength(count + 1);
  });

  it("persists both record and queue across repository recreation in operation order", async () => {
    const first = await loadRepository();
    const created = first.deurRepository.create(buildRecord());
    first.deurRepository.update({ ...created, acknowledgementRemarks: "saved offline" });
    expect(first.deurSyncQueue.getAll().map((item) => item.operation)).toEqual(["create", "update"]);

    vi.resetModules();
    const reloaded = await loadRepository();
    expect(reloaded.deurRepository.getById(created.id)?.acknowledgementRemarks).toBe("saved offline");
    expect(reloaded.deurSyncQueue.getAll().map((item) => item.operation)).toEqual(["create", "update"]);
  });
});
