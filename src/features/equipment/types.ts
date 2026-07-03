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

  project: string;

  operator: string;

  status: EquipmentStatus;

  deleted?: boolean;

  deletedAt?: number;
}

export interface EquipmentFormData {
  assetNo: string;

  equipmentName: string;

  category: string;

  maintenanceType: MaintenanceType;

  currentReading: number;

  project: string;

  operator: string;
}