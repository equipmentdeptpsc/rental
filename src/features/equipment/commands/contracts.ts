import type { OperationalCommandMetadata, OperationalCommandResult } from "@/features/rental/operations/commands/contracts";

export const EQUIPMENT_MAINTENANCE_TYPES = ["Engine Hours", "Kilometers", "Mileage", "Calendar Days"] as const;
export type EquipmentMaintenanceType = typeof EQUIPMENT_MAINTENANCE_TYPES[number];

export interface CreateEquipmentCommand extends OperationalCommandMetadata {
  equipmentId: string;
  assetNo: string;
  equipmentName: string;
  maintenanceType: EquipmentMaintenanceType;
  costCodeId: string;
  currentReading?: number;
  remarks?: string;
}

export interface EquipmentCreationProjection {
  id: string; companyId: string; assetNo: string; equipmentName: string;
  maintenanceType: EquipmentMaintenanceType; costCodeId: string; statusId: string;
  currentReading: number; remarks: string | null; active: true; deletedAt: null;
  createdAt: string; updatedAt: string; rowVersion: number;
}

export interface EquipmentCostCodeReference { id: string; code: string; name: string; active: true; sortOrder: number; }
export interface EquipmentReferenceData { costCodes: EquipmentCostCodeReference[]; }
export type EquipmentReferenceDataResult =
  | ({ success: true } & EquipmentReferenceData)
  | { success: false; code: "TRANSPORT_FAILURE" | "INVALID_RESPONSE"; message: string; retryable: boolean };

export interface EquipmentCommandRepository {
  readReferenceData(): Promise<EquipmentReferenceDataResult>;
  createEquipment(command: CreateEquipmentCommand): Promise<OperationalCommandResult<EquipmentCreationProjection>>;
}
