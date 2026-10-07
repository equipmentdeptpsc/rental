import type { RentalCommercialSnapshot, RentalEquipmentLineLifecycleStatus, RentalLineDeurExpectationSnapshot, RentalOperationalMetadataSnapshot } from "../types";

export interface RentalEquipmentLine {
  id: string;
  rentalId: string;
  equipmentId: string;
  assignmentId?: string;
  operatorId: string;
  status: RentalEquipmentLineLifecycleStatus;
  canonicalLineStatus?: RentalEquipmentLineLifecycleStatus;
  effectiveStartDate?: string;
  actualReturnDate?: string;
  rowVersion?: number;
  operationalMetadata?: RentalOperationalMetadataSnapshot;
  /** Editable source selection before release; the frozen snapshot is authoritative afterward. */
  deurWorkDescriptionId?: string;
  deurOperationalRemarks?: string;
  deurExpectationSnapshot?: RentalLineDeurExpectationSnapshot;
  commercialSnapshotRequired?: boolean;
  commercialSnapshot?: RentalCommercialSnapshot;
  createdAt: string;
  updatedAt: string;
}

/**
 * Explicit identity contract for the per-line return command boundary.
 * Keep the rental-equipment-line identity distinct from its equipment and assignment identities.
 */
export interface RentalEquipmentLineReturnTarget {
  rentalLineId: string;
  equipmentId: string;
  assignmentId?: string;
  rowVersion?: number;
}

export function toRentalEquipmentLineReturnTarget(line: RentalEquipmentLine): RentalEquipmentLineReturnTarget {
  return {
    rentalLineId: line.id,
    equipmentId: line.equipmentId,
    assignmentId: line.assignmentId,
    rowVersion: line.rowVersion,
  };
}

export interface NewRentalEquipmentLineInput {
  equipmentId: string;
  assignmentId?: string;
  operatorId: string;
}

export type RentalEquipmentLineIssueCode =
  | "RENTAL_NOT_EDITABLE" | "DUPLICATE_EQUIPMENT" | "EQUIPMENT_UNAVAILABLE"
  | "EQUIPMENT_RENTAL_CONFLICT" | "ASSIGNMENT_INVALID" | "PROJECT_MISMATCH"
  | "OPERATOR_WORK_CONFLICT"
  | "LINE_NOT_FOUND" | "LINE_SNAPSHOT_LOCKED" | "ZERO_EQUIPMENT_LINES";

export interface RentalEquipmentLineIssue {
  code: RentalEquipmentLineIssueCode;
  message: string;
  rentalEquipmentLineId?: string;
  equipmentId?: string;
  assignmentId?: string;
}

export type RentalEquipmentLineMigrationIssueCode =
  | "LEGACY_RENTAL_EQUIPMENT_MISSING"
  | "LEGACY_RENTAL_OPERATOR_MISSING"
  | "RENTAL_LINE_IDENTITY_CONFLICT"
  | "AMBIGUOUS_RENTAL_EQUIPMENT_LINES"
  | "LEGACY_CONTRACT_LINE_NOT_FOUND"
  | "AMBIGUOUS_LEGACY_CONTRACT_LINES"
  | "UNSUPPORTED_RENTAL_EQUIPMENT_LINE_SCHEMA";

export interface RentalEquipmentLineMigrationIssue {
  code: RentalEquipmentLineMigrationIssueCode;
  rentalId?: string;
  equipmentId?: string;
  lineIds?: string[];
  message: string;
}

export interface RentalEquipmentLineCompatibilityResult {
  lines: RentalEquipmentLine[];
  issues: RentalEquipmentLineMigrationIssue[];
  changed: boolean;
}
