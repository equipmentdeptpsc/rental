import { beforeEach, describe, expect, it, vi } from "vitest";
import { storage } from "@/core/storage";
import type { DeurRecord } from "@/features/rental/deur/types";

const DEUR_KEY = "equipment-rental-deur";
const QUEUE_KEY = "equipment-rental-deur-sync-queue";

function acknowledged(): DeurRecord {
  return {
    id: "original", deurNumber: "DEUR-000001", rentalId: "rental", equipmentId: "equipment", operatorId: "operator",
    workDate: "2026-07-01", status: "Acknowledged", legacy: false, creationSource: "OPERATOR_DIGITAL",
    evidenceMode: "QUANTITY", billingMethodSnapshot: "Per Cubic Meter", quantityEvidence: { quantity: 10, unit: "CUBIC_METER" },
    events: [], logs: [], totalOperatingMinutes: 0, totalIdleMinutes: 0, totalMaintenanceMinutes: 0,
    totalMealBreakMinutes: 0, totalMobilizationMinutes: 0, totalDemobilizationMinutes: 0,
    acknowledgedAt: "2026-07-01T12:00:00.000Z", acknowledgedBy: "Reviewer",
    createdAt: "2026-07-01T08:00:00.000Z", updatedAt: "2026-07-01T12:00:00.000Z",
  };
}

describe("DEUR correction repository", () => {
  beforeEach(() => { storage.remove(DEUR_KEY); storage.remove(QUEUE_KEY); vi.resetModules(); });

  it("persists a separate revision and atomically supersedes the original only on acknowledgement", async () => {
    const { deurRepository } = await import("@/features/rental/deur/repository/deurRepository");
    deurRepository.create(acknowledged());
    const created = deurRepository.createCorrection({
      sourceId: "original", reasonCode: "INCORRECT_QUANTITY", actor: { id: "admin", name: "Admin", role: "Admin" },
      timestamp: "2026-07-02T08:00:00.000Z", newId: "replacement",
    });
    expect(created).toMatchObject({ success: true, revision: { id: "replacement", status: "Draft" } });
    expect(deurRepository.getById("original")).not.toHaveProperty("revision.supersededByRevisionId");
    expect(deurRepository.submit("replacement", { name: "Admin" }).success).toBe(true);
    const acknowledgedResult = deurRepository.acknowledgeCorrection("replacement", { name: "Reviewer", id: "reviewer" }, "2026-07-03T08:00:00.000Z");
    expect(acknowledgedResult).toMatchObject({ success: true, record: { revision: { supersedesRevisionId: "original" } }, superseded: { revision: { supersededByRevisionId: "replacement", supersededByName: "Reviewer" } } });
    expect(deurRepository.getById("original")).toMatchObject({ revision: { supersededByRevisionId: "replacement" } });
  });

  it("rejecting a correction leaves the original effective and protects revision identity on ordinary updates", async () => {
    const { deurRepository } = await import("@/features/rental/deur/repository/deurRepository");
    deurRepository.create(acknowledged());
    const created = deurRepository.createCorrection({ sourceId: "original", reasonCode: "DATA_ENCODING_ERROR", actor: { name: "Admin", role: "Admin" }, timestamp: "2026-07-02T08:00:00.000Z", newId: "replacement" });
    expect(created.success).toBe(true);
    const replacement = deurRepository.getById("replacement")!;
    deurRepository.update({ ...replacement, revision: { chainId: "tampered", revisionNumber: 99, originalDeurId: "tampered" } });
    expect(deurRepository.getById("replacement")).toMatchObject({ revision: { chainId: "original", revisionNumber: 2, originalDeurId: "original" } });
    deurRepository.submit("replacement", { name: "Admin" });
    expect(deurRepository.reject("replacement", { name: "Reviewer" }, "Not accepted").success).toBe(true);
    expect(deurRepository.getById("original")).not.toHaveProperty("revision.supersededByRevisionId");
  });
});
