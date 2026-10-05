import { describe, expect, it, vi } from "vitest";
import { repositoryFailure, repositorySuccess } from "@/core/persistence";
import { readRemoteDailyLogs } from "@/features/daily-log/services/remoteDailyLogs";
import type { DeurRecord } from "@/features/rental/deur/types";
import type { ApplicationDependencies } from "@/app/composition";

const deur = (id: string, overrides: Partial<DeurRecord> = {}) => ({
  id, deurNumber: `DEUR-${id}`, rentalId: "r1", rentalEquipmentLineId: "line-12345678", equipmentId: "e1", operatorId: "o1", projectId: "p1",
  workDate: "2026-10-04", shift: "Day", status: "Submitted", totalOperatingMinutes: 90, totalIdleMinutes: 15,
  totalStandbyMinutes: 30, totalMaintenanceMinutes: 0, meterRequirement: "hourMeter", openingHourMeter: 100, closingHourMeter: 102,
  ...overrides,
}) as DeurRecord;

function paged<T extends { id: string }>(rows: T[], cap = 2) {
  return { list: vi.fn(async ({ paging }: { paging?: { offset?: number; limit?: number } } = {}) => {
    const offset = paging?.offset ?? 0;
    return repositorySuccess({ items: rows.slice(offset, offset + Math.min(paging?.limit ?? cap, cap)) });
  }) };
}

function input(deurs: DeurRecord[] = [deur("d1")], cap = 2) {
  const reads = {
    deurs: paged(deurs, cap),
    equipment: paged([{ id: "e1", assetNo: "EQ-01", equipmentName: "Excavator" }]),
    operators: paged([{ id: "o1", name: "Ana Operator" }]),
    projects: paged([{ id: "p1", projectName: "North Site" }]),
    rentals: paged([{ id: "r1", rentalNumber: "RENT-01", projectId: "p1" }]),
    rentalEquipmentLines: paged([{ id: "line-12345678", rentalId: "r1" }]),
  };
  return { reads, dependencies: { readRepositories: reads } as unknown as ApplicationDependencies };
}

describe("remote Daily Logs read model", () => {
  it("keeps one current revision per chain, joins labels, sorts newest first, and summarizes evidence", async () => {
    const old = deur("d1", { revision: { chainId: "chain-1", revisionNumber: 1, originalDeurId: "d1", supersededByRevisionId: "d2" } });
    const current = deur("d2", { revision: { chainId: "chain-1", revisionNumber: 2, originalDeurId: "d1" } });
    const latest = deur("d3", { workDate: "2026-10-05", status: "Acknowledged", projectId: undefined, revision: undefined });
    const source = input([old, current, latest, deur("deleted", { deletedAt: "2026-10-04" } as never)], 1);
    const model = await readRemoteDailyLogs(source.dependencies, { today: "2026-10-05" });
    expect(model).toMatchObject({ total: 2, today: 1, equipmentLogged: 1, awaitingReview: 1 });
    expect(model.rows.map((row) => row.id)).toEqual(["d3", "d2"]);
    expect(model.rows[0].revision).toBe("R1");
    expect(model.rows[1]).toMatchObject({ revision: "R2", equipment: "EQ-01 · Excavator", operator: "Ana Operator", project: "North Site", rental: "RENT-01", rentalEquipmentLine: "Line line-123", shift: "Day", status: "Submitted" });
    expect(model.rows[1].activity).toContain("Operation 1h 30m · Idle 15m · Standby 30m · Maintenance 0m");
    expect(model.rows[1].meter).toBe("Hour meter 100 → 102");
    expect(source.reads.deurs.list.mock.calls.map(([options]) => options?.paging?.offset)).toEqual([0, 1, 2, 3, 4]);
  });

  it("shows safe fallbacks for missing optional joins and absent meter evidence", async () => {
    const source = input([deur("missing", { equipmentId: "unknown", operatorId: "unknown", projectId: "unknown", rentalId: "unknown", rentalEquipmentLineId: "unknown", meterRequirement: "none", openingHourMeter: undefined, closingHourMeter: undefined, totalStandbyMinutes: undefined })]);
    const model = await readRemoteDailyLogs(source.dependencies, { today: "2026-10-05" });
    expect(model.rows[0]).toMatchObject({ equipment: "Unknown equipment", operator: "Unknown operator", project: "Unassigned project", rental: "Unknown rental", rentalEquipmentLine: "Line unknown (unavailable)", meter: "—" });
    expect(model.rows[0].activity).not.toContain("Standby");
  });

  it("keeps the acknowledged revision effective while a correction is pending", async () => {
    const acknowledged = deur("d1", { status: "Acknowledged", revision: { chainId: "chain-1", revisionNumber: 1, originalDeurId: "d1" } });
    const pending = deur("d2", { status: "Draft", revision: { chainId: "chain-1", revisionNumber: 2, originalDeurId: "d1", previousRevisionId: "d1" } });
    const model = await readRemoteDailyLogs(input([acknowledged, pending]).dependencies, { today: "2026-10-05" });
    expect(model.rows.map((row) => row.id)).toEqual(["d1"]);
    expect(model.rows[0].revision).toBe("R1");
  });

  it("shows odometer trip evidence without inventing hour-meter readings", async () => {
    const trip = deur("trip", { meterRequirement: "none", openingHourMeter: undefined, closingHourMeter: undefined, evidenceMode: "ODOMETER_TRIP", odometerTripEvidence: { checkpoints: [], segments: [], startingOdometer: 1200, endingOdometer: 1245, totalDistance: 45, tripCount: 1 } });
    const model = await readRemoteDailyLogs(input([trip]).dependencies, { today: "2026-10-05" });
    expect(model.rows[0].meter).toBe("Odometer 1200 → 1245 · Distance 45 km");
    expect(model.rows[0].meter).not.toContain("Hour meter");
  });

  it("fails closed for duplicate pages, conflicting current revisions, and reader errors", async () => {
    const duplicate = input();
    duplicate.reads.deurs.list.mockImplementation(async () => repositorySuccess({ items: [deur("d1")] }) as never);
    await expect(readRemoteDailyLogs(duplicate.dependencies, { today: "2026-10-05" })).rejects.toThrow("changed while loading");
    const revisions = input([deur("d1", { revision: { chainId: "chain", originalDeurId: "d1", revisionNumber: 1 } }), deur("d2", { revision: { chainId: "chain", originalDeurId: "d1", revisionNumber: 1 } })]);
    await expect(readRemoteDailyLogs(revisions.dependencies, { today: "2026-10-05" })).rejects.toThrow("revision data is inconsistent");
    const failed = input();
    failed.reads.deurs.list.mockImplementationOnce(async () => repositoryFailure("REMOTE_READ_FAILED", "DEUR read unavailable", { context: {}, recoverability: "RETRYABLE", recommendedAction: "Retry" }) as never);
    await expect(readRemoteDailyLogs(failed.dependencies, { today: "2026-10-05" })).rejects.toThrow("DEUR read unavailable");
  });

  it("returns a genuine empty model when all reader pages are empty", async () => {
    await expect(readRemoteDailyLogs(input([]).dependencies, { today: "2026-10-05" })).resolves.toMatchObject({ rows: [], total: 0, today: 0, awaitingReview: 0 });
  });
});
