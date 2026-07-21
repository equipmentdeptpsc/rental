import type { RentalRecord } from "../types";
import type { RentalEquipmentLine, RentalEquipmentLineCompatibilityResult, RentalEquipmentLineMigrationIssue } from "./types";

export const RENTAL_EQUIPMENT_LINE_SCHEMA_VERSION = 1;
export const compatibilityRentalEquipmentLineId = (rentalId: string, equipmentId: string) => `rental-line:${rentalId}:${equipmentId}`;

function issue(value: RentalEquipmentLineMigrationIssue): RentalEquipmentLineMigrationIssue {
  return value;
}

export function materializeRentalEquipmentLineCompatibility(
  rentals: RentalRecord[],
  persistedLines: RentalEquipmentLine[],
  timestamp = new Date().toISOString(),
): RentalEquipmentLineCompatibilityResult {
  const lines = structuredClone(persistedLines);
  const issues: RentalEquipmentLineMigrationIssue[] = [];
  let changed = false;

  for (const rental of rentals) {
    const existingRentalLines = lines.filter((line) => line.rentalId === rental.id);
    if (existingRentalLines.length > 0 && !rental.equipmentId?.trim()) {
      for (const existing of existingRentalLines) {
        if (!existing.status) {
          existing.status = rental.status;
          existing.updatedAt = timestamp;
          changed = true;
        }
      }
      continue;
    }
    const equipmentId = rental.equipmentId?.trim();
    if (!equipmentId) {
      issues.push(issue({ code: "LEGACY_RENTAL_EQUIPMENT_MISSING", rentalId: rental.id, message: "Legacy Rental has no equipment identity; no compatibility line was inferred." }));
      continue;
    }
    const operatorId = rental.operatorId?.trim();
    if (!operatorId) {
      issues.push(issue({ code: "LEGACY_RENTAL_OPERATOR_MISSING", rentalId: rental.id, equipmentId, message: "Legacy Rental has no operator identity; no compatibility line was inferred." }));
      continue;
    }

    const deterministicId = compatibilityRentalEquipmentLineId(rental.id, equipmentId);
    const sameRentalEquipment = lines.filter((line) => line.rentalId === rental.id && line.equipmentId === equipmentId);
    const deterministic = lines.find((line) => line.id === deterministicId);
    if (deterministic && (deterministic.rentalId !== rental.id || deterministic.equipmentId !== equipmentId)) {
      issues.push(issue({ code: "RENTAL_LINE_IDENTITY_CONFLICT", rentalId: rental.id, equipmentId, lineIds: [deterministic.id], message: "The deterministic compatibility line identity is already associated with different data." }));
      continue;
    }
    if (sameRentalEquipment.length > 1) {
      issues.push(issue({ code: "AMBIGUOUS_RENTAL_EQUIPMENT_LINES", rentalId: rental.id, equipmentId, lineIds: sameRentalEquipment.map((line) => line.id), message: "Multiple equipment lines match the legacy Rental; header data was not applied." }));
      continue;
    }
    if (sameRentalEquipment.length === 1) {
      const existing = sameRentalEquipment[0];
      if (!existing.status) { existing.status = rental.status; existing.updatedAt = timestamp; changed = true; }
      if (!existing.commercialSnapshot && rental.commercialSnapshot) {
        existing.commercialSnapshot = structuredClone(rental.commercialSnapshot);
        existing.commercialSnapshotRequired = rental.commercialSnapshotRequired === true ? true : existing.commercialSnapshotRequired;
        existing.updatedAt = timestamp;
        changed = true;
      }
      continue;
    }

    const createdAt = rental.createdAt && Number.isFinite(Date.parse(rental.createdAt)) ? new Date(rental.createdAt).toISOString() : timestamp;
    lines.push({
      id: deterministicId,
      rentalId: rental.id,
      equipmentId,
      assignmentId: rental.assignmentId,
      operatorId,
      status: rental.status,
      operationalMetadata: rental.operationalMetadata ? structuredClone(rental.operationalMetadata) : undefined,
      commercialSnapshotRequired: rental.commercialSnapshotRequired === true ? true : undefined,
      commercialSnapshot: rental.commercialSnapshot ? structuredClone(rental.commercialSnapshot) : undefined,
      createdAt,
      updatedAt: createdAt,
    });
    changed = true;
  }

  return { lines, issues, changed };
}
