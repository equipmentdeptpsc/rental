import type { RentalRecord } from "../../types";
import { materializeRentalEquipmentLineCompatibility, rentalEquipmentLineRepository, type RentalEquipmentLine } from "../../equipment-line";
import type { DeurRecord } from "../types";
import { canStartDeur } from "./DeurValidationService";

export type DeurLineResolutionIssueCode = "DEUR_LINE_NOT_FOUND" | "DEUR_LINE_AMBIGUOUS" | "DEUR_LINE_RENTAL_MISMATCH" | "DEUR_LINE_EQUIPMENT_MISMATCH" | "DEUR_LINE_ASSIGNMENT_MISMATCH" | "DEUR_LINE_OPERATOR_MISMATCH" | "DEUR_LINE_NOT_OPERATIONAL" | "DEUR_LINE_COMMERCIAL_SNAPSHOT_REQUIRED";
export type DeurLineResolution = { success: true; line: RentalEquipmentLine; legacy: boolean } | { success: false; issue: { code: DeurLineResolutionIssueCode; message: string } };

export function resolveDeurRentalEquipmentLine(input: {
  rental: RentalRecord;
  rentalEquipmentLineId?: string;
  equipmentId?: string;
  assignmentId?: string;
  operatorId?: string;
  requireOperationalSnapshot?: boolean;
  allowLegacyEquipmentResolution?: boolean;
}): DeurLineResolution {
  const compatibilityRental: RentalRecord = {
    ...input.rental,
    equipmentId: input.rental.equipmentId || input.equipmentId || "",
    operatorId: input.rental.operatorId || input.operatorId,
    assignmentId: input.rental.assignmentId ?? input.assignmentId,
  };
  const lines = materializeRentalEquipmentLineCompatibility([compatibilityRental], rentalEquipmentLineRepository.getAll()).lines.filter((line) => line.rentalId === input.rental.id);
  if (!input.rentalEquipmentLineId && lines.length > 1 && !input.allowLegacyEquipmentResolution) return { success: false, issue: { code: "DEUR_LINE_AMBIGUOUS", message: "Select a specific Rental Equipment Line before creating this DEUR." } };
  let candidates: RentalEquipmentLine[];
  if (input.rentalEquipmentLineId) candidates = lines.filter((line) => line.id === input.rentalEquipmentLineId);
  else if (input.equipmentId) candidates = lines.filter((line) => line.equipmentId === input.equipmentId);
  else candidates = lines;
  if (candidates.length === 0) return { success: false, issue: { code: "DEUR_LINE_NOT_FOUND", message: "No Rental Equipment Line matches this DEUR." } };
  if (candidates.length > 1) return { success: false, issue: { code: "DEUR_LINE_AMBIGUOUS", message: "Select a specific Rental Equipment Line before creating this DEUR." } };
  const line = candidates[0];
  if (line.rentalId !== input.rental.id) return { success: false, issue: { code: "DEUR_LINE_RENTAL_MISMATCH", message: "Rental Equipment Line does not belong to this Rental." } };
  if (input.equipmentId && line.equipmentId !== input.equipmentId) return { success: false, issue: { code: "DEUR_LINE_EQUIPMENT_MISMATCH", message: "DEUR equipment does not match the selected Rental Equipment Line." } };
  if (input.assignmentId !== undefined && line.assignmentId !== input.assignmentId) return { success: false, issue: { code: "DEUR_LINE_ASSIGNMENT_MISMATCH", message: "DEUR Assignment does not match the selected Rental Equipment Line." } };
  if (input.operatorId && line.operatorId !== input.operatorId) return { success: false, issue: { code: "DEUR_LINE_OPERATOR_MISMATCH", message: "DEUR Operator does not match the selected Rental Equipment Line." } };
  if (!canStartDeur(input.rental) || !["Released", "Active"].includes(line.status)) return { success: false, issue: { code: "DEUR_LINE_NOT_OPERATIONAL", message: "Rental must be Active and its Equipment Line must be operational." } };
  if (input.requireOperationalSnapshot !== false && line.commercialSnapshotRequired && !line.commercialSnapshot) return { success: false, issue: { code: "DEUR_LINE_COMMERCIAL_SNAPSHOT_REQUIRED", message: "Rental Equipment Line commercial terms snapshot is required before creating a DEUR." } };
  return { success: true, line: structuredClone(line), legacy: !input.rentalEquipmentLineId };
}

export function resolveLegacyDeurRentalEquipmentLine(record: Pick<DeurRecord, "rentalId" | "rentalEquipmentLineId" | "equipmentId">, rentals: RentalRecord[]): DeurLineResolution {
  const rental = rentals.find((item) => item.id === record.rentalId);
  if (!rental) return { success: false, issue: { code: "DEUR_LINE_NOT_FOUND", message: "Legacy DEUR Rental was not found." } };
  return resolveDeurRentalEquipmentLine({ rental, rentalEquipmentLineId: record.rentalEquipmentLineId, equipmentId: record.equipmentId, requireOperationalSnapshot: false, allowLegacyEquipmentResolution: true });
}
