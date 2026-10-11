import type { OperationalCommandMetadata, OperationalCommandResult } from "@/features/rental/operations/commands/contracts";

export const EQUIPMENT_MAINTENANCE_TYPES = ["Hour Meter", "Mileage", "None", "Both", "Engine Hours", "Kilometers", "Calendar Days"] as const;
export type EquipmentMaintenanceType = typeof EQUIPMENT_MAINTENANCE_TYPES[number];

export interface CreateEquipmentCommand extends OperationalCommandMetadata {
  equipmentId: string;
  equipmentName: string;
  categoryId: string;
  subcategoryId: string;
  legacyEquipmentNumber?: string;
  brandId?: string;
  modelId?: string;
  serialNumber?: string;
  yearModel?: number;
  ownershipId?: string;
  locationId?: string;
  conditionId?: string;
  maintenanceType: EquipmentMaintenanceType;
  costCodeId: string;
  currentReading?: number;
  remarks?: string;
}

export interface EquipmentCreationProjection {
  id: string; companyId: string; assetNo: string; legacyEquipmentNumber?: string | null; equipmentName: string;
  categoryId?: string | null; subcategoryId?: string | null;
  brandId?: string | null; modelId?: string | null; serialNumber?: string | null; yearModel?: number | null;
  ownershipId?: string | null; locationId?: string | null; conditionId?: string | null;
  maintenanceType: EquipmentMaintenanceType; costCodeId: string; statusId: string;
  currentReading: number; remarks: string | null; active: true; deletedAt: null;
  createdAt: string; updatedAt: string; rowVersion: number;
}

export interface EquipmentCostCodeReference { id: string; code: string; name: string; active: true; sortOrder: number; }
export interface EquipmentMasterReference { id: string; code: string | null; name: string; active: true; }
export interface EquipmentReferenceData { costCodes: EquipmentCostCodeReference[]; brands: EquipmentMasterReference[]; models: EquipmentMasterReference[]; ownerships: EquipmentMasterReference[]; locations: EquipmentMasterReference[]; conditions: EquipmentMasterReference[]; }
export type EquipmentReferenceDataResult =
  | ({ success: true } & EquipmentReferenceData)
  | { success: false; code: "TRANSPORT_FAILURE" | "INVALID_RESPONSE"; message: string; retryable: boolean };

export interface EquipmentCommandRepository {
  readReferenceData(): Promise<EquipmentReferenceDataResult>;
  createEquipment(command: CreateEquipmentCommand): Promise<OperationalCommandResult<EquipmentCreationProjection>>;
}
