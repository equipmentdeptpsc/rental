import { beforeEach, describe, expect, it, vi } from "vitest";

import { storage } from "@/core/storage";
import { deurRepository } from "@/features/rental/deur/repository/deurRepository";
import { normalizeDeur } from "@/features/rental/deur/services/canonicalDeur";
import { subscribeDeurChanges } from "@/features/rental/deur/synchronization/deurChangeNotifications";
import { DeurAppliedOperationRepository } from "@/features/rental/deur/synchronization/inbound/DeurAppliedOperationRepository";
import { DeurConflictRepository } from "@/features/rental/deur/synchronization/inbound/DeurConflictRepository";
import { DeurSyncCursorRepository } from "@/features/rental/deur/synchronization/inbound/DeurSyncCursorRepository";
import { synchronizeInboundDeur } from "@/features/rental/deur/synchronization/inbound/synchronizeInboundDeur";
import type { DeurSyncChangeEnvelope, JsonValue } from "@/features/rental/deur/synchronization/types";
import type { DeurRecord } from "@/features/rental/deur/types";
import { InMemoryDeurSyncTransport } from "./fakes/InMemoryDeurSyncTransport";

const KEYS = [
  "equipment-rental-deur",
  "equipment-rental-deur-sync-queue",
  "equipment-rental-deur-inbound-cursor",
  "equipment-rental-deur-applied-operations",
  "equipment-rental-deur-conflicts",
];

function record(overrides: Partial<DeurRecord> = {}): DeurRecord {
  return {
    id: "deur-1",
    rentalId: "rental-1",
    equipmentId: "equipment-1",
    operatorId: "operator-1",
    workDate: "2026-07-19",
    logs: [{ id: "activity-1", activity: "Operation", startTime: "23:50", durationMinutes: 0 }],
    totalOperatingMinutes: 0,
    totalIdleMinutes: 0,
    totalMaintenanceMinutes: 0,
    totalMealBreakMinutes: 0,
    totalMobilizationMinutes: 0,
    totalDemobilizationMinutes: 0,
    status: "In Progress",
    createdAt: "2026-07-19T23:50:00.000Z",
    updatedAt: "2026-07-19T23:50:00.000Z",
    ...overrides,
  };
}

function json(value: unknown): JsonValue {
  return JSON.parse(JSON.stringify(value)) as JsonValue;
}

function envelope(operationId: string, payload: unknown = record(), overrides: Partial<DeurSyncChangeEnvelope> = {}): DeurSyncChangeEnvelope {
  return {
    schemaVersion: 1,
    entity: { type: "DEUR", id: "deur-1" },
    operation: "update",
    operationId,
    idempotencyKey: operationId,
    localRevision: 1,
    baseRemoteRevision: 0,
    remoteRevision: 1,
    occurredAt: "2026-07-19T23:50:00.000Z",
    payload: json(payload),
    ...overrides,
  };
}

function dependencies(transport: InMemoryDeurSyncTransport) {
  return {
    transport,
    deurs: deurRepository,
    cursors: new DeurSyncCursorRepository(),
    appliedOperations: new DeurAppliedOperationRepository(),
    conflicts: new DeurConflictRepository(),
  };
}

describe("inbound DEUR synchronization", () => {
  beforeEach(() => KEYS.forEach((key) => storage.remove(key)));

  it("pulls from the persisted cursor and advances it after applying a remote-only record", async () => {
    const transport = new InMemoryDeurSyncTransport();
    transport.simulateRemoteChange(envelope("remote-1"));
    const deps = dependencies(transport);
    deps.cursors.save("0");

    const result = await synchronizeInboundDeur(deps);

    expect(transport.getPullRequests()).toEqual([{ cursor: "0" }]);
    expect(result).toMatchObject({ success: true, applied: 1, cursor: "1" });
    expect(deurRepository.getById("deur-1")?.logs).toHaveLength(1);
    expect(deps.cursors.get()).toBe("1");
  });

  it("applies an operation exactly once and publishes no duplicate notification on replay", async () => {
    const transport = new InMemoryDeurSyncTransport();
    transport.simulateRemoteChange(envelope("remote-1"));
    const deps = dependencies(transport);
    const listener = vi.fn();
    const stop = subscribeDeurChanges(listener);

    await synchronizeInboundDeur(deps);
    deps.cursors.save("0");
    const replay = await synchronizeInboundDeur(deps);

    expect(replay).toMatchObject({ success: true, duplicates: 1, applied: 0 });
    expect(deurRepository.getById("deur-1")?.logs).toHaveLength(1);
    expect(listener).toHaveBeenCalledOnce();
    stop();
  });

  it("leaves the previous cursor intact on a temporary pull failure", async () => {
    const transport = new InMemoryDeurSyncTransport();
    const deps = dependencies(transport);
    deps.cursors.save("7");
    transport.failNext("network", "offline");

    const result = await synchronizeInboundDeur(deps);

    expect(result).toMatchObject({ success: false, cursor: "7" });
    expect(deps.cursors.get()).toBe("7");
  });

  it("rejects malformed and unsupported remote envelopes without applying them", async () => {
    const transport = new InMemoryDeurSyncTransport();
    transport.simulateRemoteChange(envelope("malformed", { id: "deur-1", logs: "invalid" }));
    transport.simulateRemoteChange({ ...envelope("unsupported"), schemaVersion: 2 } as unknown as DeurSyncChangeEnvelope);
    const result = await synchronizeInboundDeur(dependencies(transport));

    expect(result).toMatchObject({ success: true, rejected: 2, applied: 0 });
    expect(deurRepository.getAll()).toEqual([]);
  });

  it("merges non-overlapping evidence while preserving the local record", async () => {
    const local = record();
    deurRepository.applyInbound(local);
    const remote = normalizeDeur(record({
      logs: [{ id: "activity-2", activity: "Idle", startTime: "00:10", durationMinutes: 0 }],
    }));
    const transport = new InMemoryDeurSyncTransport();
    transport.simulateRemoteChange(envelope("remote-merge", remote));

    const result = await synchronizeInboundDeur(dependencies(transport));

    expect(result).toMatchObject({ success: true, applied: 1 });
    expect(deurRepository.getById("deur-1")?.logs.map((item) => item.id)).toEqual(["activity-1", "activity-2"]);
    expect(local.logs).toHaveLength(1);
  });

  it("retains competing activity edits once with both immutable envelopes", async () => {
    deurRepository.applyInbound(record());
    const remoteRecord = record({ logs: [{ id: "activity-1", activity: "Idle", startTime: "23:50", durationMinutes: 0 }] });
    const transport = new InMemoryDeurSyncTransport();
    const remote = envelope("remote-conflict", remoteRecord);
    transport.simulateRemoteChange(remote);
    const deps = dependencies(transport);

    await synchronizeInboundDeur(deps);
    deps.cursors.save("0");
    await synchronizeInboundDeur(deps);

    const conflicts = deps.conflicts.getAll();
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]).toMatchObject({ entityId: "deur-1", classification: "competing-activity-edit", status: "unresolved" });
    expect(conflicts[0].local.payload).toBeDefined();
    expect(conflicts[0].remote).toEqual(remote);
    expect(deurRepository.getById("deur-1")?.logs[0].activity).toBe("Operation");
  });

  it("persists cursor, applied IDs, and conflicts across repository reconstruction", () => {
    const cursors = new DeurSyncCursorRepository();
    const applied = new DeurAppliedOperationRepository();
    const conflicts = new DeurConflictRepository();
    cursors.save("12");
    applied.add("operation-1");
    conflicts.add({
      id: "conflict-1", entityId: "deur-1", local: envelope("local"), remote: envelope("remote"),
      classification: "competing-record-edit", detectedAt: "2026-07-19T10:00:00.000Z", status: "unresolved",
    });

    expect(new DeurSyncCursorRepository().get()).toBe("12");
    expect(new DeurAppliedOperationRepository().has("operation-1")).toBe(true);
    expect(new DeurConflictRepository().getAll()).toHaveLength(1);
  });
});
