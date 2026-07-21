import type { RentalCommercialSnapshot, RentalOperationalMetadataSnapshot } from "../types";

export interface RentalEquipmentLine {
  id: string;
  rentalId: string;
  equipmentId: string;
  assignmentId?: string;
  operatorId: string;
  operationalMetadata?: RentalOperationalMetadataSnapshot;
  commercialSnapshotRequired?: boolean;
  commercialSnapshot?: RentalCommercialSnapshot;
  createdAt: string;
  updatedAt: string;
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
