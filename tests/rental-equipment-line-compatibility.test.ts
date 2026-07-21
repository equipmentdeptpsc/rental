import { beforeEach, describe, expect, it } from "vitest";
import { storage } from "@/core/storage";
import type { RentalRecord, RentalCommercialSnapshot } from "@/features/rental/types";
import type { RentalContractRecord } from "@/features/rental/types/RentalContract";
import {
  compatibilityRentalEquipmentLineId,
  materializeRentalEquipmentLineCompatibility,
  rentalEquipmentLineRepository,
  RENTAL_EQUIPMENT_LINE_SCHEMA_VERSION,
  RENTAL_EQUIPMENT_LINE_STORAGE_KEY,
  type RentalEquipmentLine,
} from "@/features/rental/equipment-line";
import { rentalContractRepository } from "@/features/rental/repository/rentalContractRepository";
import { createApplicationBackup, restoreApplicationBackup, validateApplicationBackup } from "@/features/settings/services/applicationBackupService";

const snapshot = (unitRate: number): RentalCommercialSnapshot => ({
  billingMethod: "Per Hour", unitRate, operatorIncluded: true, currency: "PHP", capturedAt: "2026-07-20T00:00:00.000Z",
});
const rental = (overrides: Partial<RentalRecord> = {}): RentalRecord => ({
  id: "rental-1", rentalNumber: "R-1", equipmentId: "equipment-1", assignmentId: "assignment-1", operatorId: "operator-1",
  customer: "Customer", project: "Project", rentedBy: "", dateOut: "2026-07-20", statusId: "reserved", status: "Reserved",
  operationalMetadata: { costCode: { code: "C", name: "Cost" }, activityCode: { code: "A", name: "Activity" } },
  commercialSnapshotRequired: true, createdAt: "2026-07-19T00:00:00.000Z", ...overrides,
});
const line = (overrides: Partial<RentalEquipmentLine> = {}): RentalEquipmentLine => ({
  id: compatibilityRentalEquipmentLineId("rental-1", "equipment-1"), rentalId: "rental-1", equipmentId: "equipment-1",
  assignmentId: "assignment-1", operatorId: "operator-1", commercialSnapshotRequired: true,
  status: "Reserved",
  createdAt: "2026-07-19T00:00:00.000Z", updatedAt: "2026-07-19T00:00:00.000Z", ...overrides,
});
const contract: RentalContractRecord = {
  id: "rental-1", contractNo: "C-1", customerId: "customer-1", equipmentId: "equipment-1", projectId: "project-1",
  rentalType: "Operated Rental", billingMethod: "Per Hour", currency: "PHP", unitRate: 100, operatorIncluded: true,
  startDate: "2026-07-20", expectedEndDate: "2026-07-21", status: "Active", createdAt: "2026-07-19T00:00:00.000Z", updatedAt: "2026-07-19T00:00:00.000Z",
};

describe("Rental Equipment Line compatibility", () => {
  beforeEach(() => storage.clear());

  it("synthesizes exactly one deterministic line and preserves legacy relationships and metadata", () => {
    const result = rentalEquipmentLineRepository.ensureCompatibility([rental()]);
    expect(result).toMatchObject({ changed: true, issues: [] });
    expect(result.lines).toEqual([expect.objectContaining({
      id: "rental-line:rental-1:equipment-1", rentalId: "rental-1", equipmentId: "equipment-1",
      assignmentId: "assignment-1", operatorId: "operator-1",
      operationalMetadata: rental().operationalMetadata,
    })]);
  });

  it("is idempotent across repeated reads and refreshes", () => {
    rentalEquipmentLineRepository.ensureCompatibility([rental()]);
    rentalEquipmentLineRepository.ensureCompatibility([rental()]);
    expect(rentalEquipmentLineRepository.getByRentalId("rental-1")).toHaveLength(1);
    expect(storage.get<{ schemaVersion: number }>(RENTAL_EQUIPMENT_LINE_STORAGE_KEY)?.schemaVersion).toBe(RENTAL_EQUIPMENT_LINE_SCHEMA_VERSION);
  });

  it("copies a legacy snapshot only while the matching line has none", () => {
    rentalEquipmentLineRepository.ensureCompatibility([rental()]);
    const copied = rentalEquipmentLineRepository.ensureCompatibility([rental({ commercialSnapshot: snapshot(100) })]);
    expect(copied.lines[0].commercialSnapshot?.unitRate).toBe(100);
    const protectedResult = rentalEquipmentLineRepository.ensureCompatibility([rental({ commercialSnapshot: snapshot(999) })]);
    expect(protectedResult.lines[0].commercialSnapshot?.unitRate).toBe(100);
  });

  it("does not permit repository updates to overwrite an existing line snapshot", () => {
    rentalEquipmentLineRepository.create(line({ commercialSnapshot: snapshot(100) }));
    rentalEquipmentLineRepository.update(line({ commercialSnapshot: snapshot(999) }));
    expect(rentalEquipmentLineRepository.getById(line().id)?.commercialSnapshot?.unitRate).toBe(100);
  });

  it("associates an existing Rental-scoped contract with the synthesized line without changing identity", () => {
    localStorage.setItem("equipment-rental-contracts", JSON.stringify([contract]));
    const lines = rentalEquipmentLineRepository.ensureCompatibility([rental()]).lines;
    const result = rentalContractRepository.ensureLineAssociations(lines);
    expect(result.issues).toEqual([]);
    expect(result.contracts[0]).toMatchObject({ id: "rental-1", rentalId: "rental-1", rentalEquipmentLineId: line().id, equipmentId: "equipment-1", unitRate: 100 });
    expect(rentalContractRepository.getById("rental-1")?.rentalEquipmentLineId).toBe(line().id);
  });

  it("surfaces ambiguous matches and leaves persisted data unchanged", () => {
    const duplicate = line({ id: "custom-line" });
    const persisted = { schemaVersion: 1, records: [line(), duplicate] };
    storage.set(RENTAL_EQUIPMENT_LINE_STORAGE_KEY, persisted);
    const result = rentalEquipmentLineRepository.ensureCompatibility([rental({ commercialSnapshot: snapshot(999) })]);
    expect(result.issues).toEqual([expect.objectContaining({ code: "AMBIGUOUS_RENTAL_EQUIPMENT_LINES", lineIds: [line().id, "custom-line"] })]);
    expect(storage.get(RENTAL_EQUIPMENT_LINE_STORAGE_KEY)).toEqual(persisted);
  });

  it("surfaces missing legacy identities instead of guessing", () => {
    const missingEquipment = materializeRentalEquipmentLineCompatibility([rental({ equipmentId: "" })], [], "2026-07-20T00:00:00.000Z");
    const missingOperator = materializeRentalEquipmentLineCompatibility([rental({ operatorId: "" })], [], "2026-07-20T00:00:00.000Z");
    expect(missingEquipment).toMatchObject({ lines: [], issues: [{ code: "LEGACY_RENTAL_EQUIPMENT_MISSING" }] });
    expect(missingOperator).toMatchObject({ lines: [], issues: [{ code: "LEGACY_RENTAL_OPERATOR_MISSING" }] });
  });

  it("includes the versioned line collection in backups while accepting legacy backups without it", () => {
    rentalEquipmentLineRepository.ensureCompatibility([rental()]);
    const backup = createApplicationBackup(new Date("2026-07-20T00:00:00.000Z"));
    expect(backup.data[RENTAL_EQUIPMENT_LINE_STORAGE_KEY]).toMatchObject({ schemaVersion: 1, records: [expect.objectContaining({ id: line().id })] });
    const legacy = structuredClone(backup) as unknown as { data: Record<string, unknown> };
    delete legacy.data[RENTAL_EQUIPMENT_LINE_STORAGE_KEY];
    expect(validateApplicationBackup(legacy).backup.data[RENTAL_EQUIPMENT_LINE_STORAGE_KEY]).toBeNull();
  });

  it("restores line contracts and immutable snapshots from an application backup", () => {
    rentalEquipmentLineRepository.create(line({ commercialSnapshot: snapshot(100) }));
    expect(rentalContractRepository.saveForRentalEquipmentLine({
      ...contract,
      rentalId: "rental-1",
      rentalEquipmentLineId: line().id,
    }).success).toBe(true);
    const backup = createApplicationBackup(new Date("2026-07-20T00:00:00.000Z"));

    storage.clear();
    restoreApplicationBackup(validateApplicationBackup(backup));

    expect(rentalEquipmentLineRepository.getById(line().id)?.commercialSnapshot).toEqual(snapshot(100));
    expect(rentalContractRepository.getByRentalEquipmentLineId(line().id)).toMatchObject({
      status: "found",
      contract: { rentalId: "rental-1", rentalEquipmentLineId: line().id, unitRate: 100 },
    });
  });
});
