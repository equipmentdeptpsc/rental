import type { RentalRecord } from "../types";
import type { RentalContractRecord } from "../types/RentalContract";
import type { RentalEquipmentLine } from "../equipment-line";
import { createRentalCommercialSnapshot } from "./createRentalCommercialSnapshot";

export interface RentalEquipmentLineReleaseIssue {
  code: "RENTAL_EQUIPMENT_LINE_MISSING" | "COMMERCIAL_TERMS_MISSING" | "COMMERCIAL_TERMS_AMBIGUOUS" | "COMMERCIAL_TERMS_LINE_MISMATCH" | "COMMERCIAL_TERMS_INVALID";
  rentalEquipmentLineId?: string;
  equipmentId?: string;
  message: string;
}
export type PrepareRentalEquipmentLineReleaseResult =
  | { success: true; lines: RentalEquipmentLine[] }
  | { success: false; issues: RentalEquipmentLineReleaseIssue[] };

export function prepareRentalEquipmentLineRelease(input: {
  rental: RentalRecord;
  lines: RentalEquipmentLine[];
  contracts: RentalContractRecord[];
  timestamp: string;
}): PrepareRentalEquipmentLineReleaseResult {
  const lines = input.lines.filter((line) => line.rentalId === input.rental.id);
  if (lines.length === 0) return { success: false, issues: [{ code: "RENTAL_EQUIPMENT_LINE_MISSING", message: "Rental has no equipment line available for release." }] };
  const issues: RentalEquipmentLineReleaseIssue[] = [];
  const prepared = lines.map((line) => {
    if (line.commercialSnapshot) return structuredClone(line);
    const contracts = input.contracts.filter((contract) => contract.rentalEquipmentLineId === line.id);
    // Compatibility-only legacy lines remain outside the commercial snapshot
    // workflow until they are explicitly migrated. New lines are always marked
    // as requiring a snapshot when they are created.
    if (line.commercialSnapshotRequired !== true) return structuredClone(line);
    if (contracts.length === 0) {
      issues.push({ code: "COMMERCIAL_TERMS_MISSING", rentalEquipmentLineId: line.id, equipmentId: line.equipmentId, message: `commercial terms are required for equipment '${line.equipmentId}'.` });
      return structuredClone(line);
    }
    if (contracts.length > 1) {
      issues.push({ code: "COMMERCIAL_TERMS_AMBIGUOUS", rentalEquipmentLineId: line.id, equipmentId: line.equipmentId, message: `Multiple commercial terms records exist for equipment '${line.equipmentId}'.` });
      return structuredClone(line);
    }
    const contract = contracts[0];
    if (contract.rentalId !== input.rental.id || contract.equipmentId !== line.equipmentId) {
      issues.push({ code: "COMMERCIAL_TERMS_LINE_MISMATCH", rentalEquipmentLineId: line.id, equipmentId: line.equipmentId, message: `Commercial terms do not match equipment '${line.equipmentId}'.` });
      return structuredClone(line);
    }
    const captured = createRentalCommercialSnapshot(contract, input.timestamp);
    if (!captured.success) {
      issues.push({ code: "COMMERCIAL_TERMS_INVALID", rentalEquipmentLineId: line.id, equipmentId: line.equipmentId, message: `${line.equipmentId}: ${captured.issues[0]?.message ?? "Commercial terms are invalid."}` });
      return structuredClone(line);
    }
    return { ...structuredClone(line), commercialSnapshotRequired: true, commercialSnapshot: captured.snapshot, updatedAt: new Date(input.timestamp).toISOString() };
  });
  return issues.length ? { success: false, issues } : { success: true, lines: prepared };
}
