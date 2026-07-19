import { beforeEach, describe, expect, it, vi } from "vitest";

import { storage } from "@/core/storage";
import type { DeurRecord } from "@/features/rental/deur/types";

const STORAGE_KEY = "equipment-rental-deur";

function record(overrides: Partial<DeurRecord> = {}): DeurRecord {
  return {
    id: "deur-1",
    rentalId: "rental-1",
    equipmentId: "equipment-1",
    operatorId: "operator-1",
    workDate: "2026-07-19",
    logs: [{ id: "log-1", activity: "Operation", startTime: "08:00", durationMinutes: 0 }],
    totalOperatingMinutes: 0,
    totalIdleMinutes: 0,
    totalMaintenanceMinutes: 0,
    totalMealBreakMinutes: 0,
    totalMobilizationMinutes: 0,
    totalDemobilizationMinutes: 0,
    status: "In Progress",
    createdAt: "2026-07-19T08:00:00.000Z",
    updatedAt: "2026-07-19T08:00:00.000Z",
    ...overrides,
  };
}

async function loadNotifications() {
  return import("@/features/rental/deur/synchronization/deurChangeNotifications");
}

describe("DEUR change notifications", () => {
  beforeEach(() => {
    storage.remove(STORAGE_KEY);
    storage.remove("equipment-rental-deur-sync-queue");
    vi.resetModules();
  });

  it("publishes a DEUR only after the repository persists it", async () => {
    const { subscribeDeurChanges } = await loadNotifications();
    const { deurRepository } = await import("@/features/rental/deur/repository/deurRepository");
    const listener = vi.fn();
    const stop = subscribeDeurChanges(listener);
    const input = record();

    const persisted = deurRepository.create(input);

    expect(deurRepository.getById(input.id)).toEqual(persisted);
    expect(listener).toHaveBeenCalledOnce();
    expect(listener.mock.calls[0][0]).toEqual(persisted);
    stop();
  });

  it("notifies every subscriber with an immutable persisted DEUR change", async () => {
    const { notifyDeurChange, subscribeDeurChanges } = await loadNotifications();
    const first = vi.fn();
    const second = vi.fn();
    const input = record();
    const original = structuredClone(input);
    const stopFirst = subscribeDeurChanges(first);
    const stopSecond = subscribeDeurChanges(second);

    notifyDeurChange(input);
    expect(input).toEqual(original);
    input.logs[0].activity = "Idle";

    expect(first).toHaveBeenCalledOnce();
    expect(second).toHaveBeenCalledOnce();
    expect(first.mock.calls[0][0]).toEqual(original);
    expect(input).not.toEqual(original);
    stopFirst();
    stopSecond();
  });

  it("deduplicates an identical notification without duplicating activity evidence", async () => {
    const { notifyDeurChange, subscribeDeurChanges } = await loadNotifications();
    const received: DeurRecord[] = [];
    const stop = subscribeDeurChanges((change) => received.push(change));
    const persisted = record();

    notifyDeurChange(persisted);
    notifyDeurChange(structuredClone(persisted));

    expect(received).toHaveLength(1);
    expect(received[0].logs).toHaveLength(1);
    stop();
  });

  it("stops delivering changes after a listener unsubscribes", async () => {
    const { notifyDeurChange, subscribeDeurChanges } = await loadNotifications();
    const listener = vi.fn();
    const stop = subscribeDeurChanges(listener);
    stop();

    notifyDeurChange(record());

    expect(listener).not.toHaveBeenCalled();
  });

  it("translates a changed localStorage record from another tab into one notification", async () => {
    const { subscribeDeurChanges } = await loadNotifications();
    const listener = vi.fn();
    const stop = subscribeDeurChanges(listener);
    const previous = record();
    const updated = record({
      updatedAt: "2026-07-19T09:00:00.000Z",
      logs: [{ id: "log-1", activity: "Operation", startTime: "08:00", endTime: "09:00", durationMinutes: 60 }],
    });

    window.dispatchEvent(new StorageEvent("storage", {
      key: STORAGE_KEY,
      oldValue: JSON.stringify([previous]),
      newValue: JSON.stringify([updated]),
      storageArea: window.localStorage,
    }));

    expect(listener).toHaveBeenCalledOnce();
    expect(listener.mock.calls[0][0]).toEqual(updated);
    stop();
  });

  it("ignores unchanged and malformed cross-tab storage values", async () => {
    const { subscribeDeurChanges } = await loadNotifications();
    const listener = vi.fn();
    const stop = subscribeDeurChanges(listener);
    const persisted = record();

    window.dispatchEvent(new StorageEvent("storage", {
      key: STORAGE_KEY,
      oldValue: JSON.stringify([persisted]),
      newValue: JSON.stringify([persisted]),
    }));
    window.dispatchEvent(new StorageEvent("storage", { key: STORAGE_KEY, newValue: "invalid" }));

    expect(listener).not.toHaveBeenCalled();
    stop();
  });
});
