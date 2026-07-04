export type EquipmentStatus =
  | "Available"
  | "Assigned"
  | "Maintenance";

export type MaintenanceType =
  | "Odometer"
  | "Engine Hours";

export interface EquipmentRecord {
  id: string;

  assetNo: string;

  equipmentName: string;

  category: string;

  maintenanceType: MaintenanceType;

  currentReading: number;

  projectId: string;

  operatorId: string;

  status: EquipmentStatus;

  deleted?: boolean;

  deletedAt?: number;
}

export interface EquipmentFormData {
  assetNo: string;

  equipmentName: string;

  category: string;

  maintenanceType: MaintenanceType;

  currentReading: string;

  projectId: string;

  operatorId: string;
}