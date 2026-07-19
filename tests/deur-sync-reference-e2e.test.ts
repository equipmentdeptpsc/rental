import { beforeEach, describe, expect, it, vi } from "vitest";

import { storage } from "@/core/storage";
import { deurRepository } from "@/features/rental/deur/repository/deurRepository";
import { subscribeDeurChanges } from "@/features/rental/deur/synchronization/deurChangeNotifications";
import { HttpDeurSyncTransport } from "@/features/rental/deur/synchronization/http/HttpDeurSyncTransport";
import { DeurAppliedOperationRepository } from "@/features/rental/deur/synchronization/inbound/DeurAppliedOperationRepository";
import { DeurConflictRepository } from "@/features/rental/deur/synchronization/inbound/DeurConflictRepository";
import { DeurSyncCursorRepository } from "@/features/rental/deur/synchronization/inbound/DeurSyncCursorRepository";
import { synchronizeInboundDeur } from "@/features/rental/deur/synchronization/inbound/synchronizeInboundDeur";
import { conformanceChange } from "./server/deurSyncConformance";
import { ReferenceDeurSyncServer } from "./server/ReferenceDeurSyncServer";

describe("reference server Client A to Client B synchronization", () => {
  beforeEach(() => ["equipment-rental-deur", "equipment-rental-deur-inbound-cursor", "equipment-rental-deur-applied-operations", "equipment-rental-deur-conflicts"].forEach((key) => storage.remove(key)));

  it("pushes, pulls, applies, notifies, advances the cursor, and remains idempotent", async () => {
    const server = new ReferenceDeurSyncServer();
    const clientA = new HttpDeurSyncTransport({ baseUrl: "https://reference.test", clientId: "client-a", fetch: server.fetch });
    const clientB = new HttpDeurSyncTransport({ baseUrl: "https://reference.test", clientId: "client-b", fetch: server.fetch });
    const remote = conformanceChange("operation-1", "deur-1");
    remote.payload = {
      id: "deur-1", rentalId: "rental-1", equipmentId: "equipment-1", operatorId: "operator-1", workDate: "2026-07-19",
      logs: [{ id: "activity-1", activity: "Operation", startTime: "08:00", durationMinutes: 0 }],
      totalOperatingMinutes: 0, totalIdleMinutes: 0, totalMaintenanceMinutes: 0, totalMealBreakMinutes: 0,
      totalMobilizationMinutes: 0, totalDemobilizationMinutes: 0, status: "In Progress",
      createdAt: "2026-07-19T08:00:00.000Z", updatedAt: "2026-07-19T08:00:00.000Z",
    };
    const original = structuredClone(remote);
    const listener = vi.fn();
    const stop = subscribeDeurChanges(listener);
    const dependencies = {
      transport: clientB, deurs: deurRepository, cursors: new DeurSyncCursorRepository(),
      appliedOperations: new DeurAppliedOperationRepository(), conflicts: new DeurConflictRepository(),
    };

    expect((await clientA.push({ changes: [remote] })).accepted).toHaveLength(1);
    const first = await synchronizeInboundDeur(dependencies);
    dependencies.cursors.save("0");
    const replay = await synchronizeInboundDeur(dependencies);

    expect(first).toMatchObject({ success: true, applied: 1, cursor: "1" });
    expect(replay).toMatchObject({ success: true, applied: 0, duplicates: 1, cursor: "1" });
    expect(deurRepository.getById("deur-1")?.logs).toHaveLength(1);
    expect(listener).toHaveBeenCalledOnce();
    expect(remote).toEqual(original);
    stop();
  });
});
