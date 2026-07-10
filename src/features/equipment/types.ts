export type EquipmentCategory =
  | "Moving Equipment"
  | "Non-Moving Equipment"
  | "Aerial Equipment"
  | "Light Equipment";

export type MaintenanceType =
  | "Engine Hours"
  | "Kilometers"
  | "Mileage"
  | "Calendar Days";

export type EquipmentStatus =
  | "Available"
  | "Assigned"
  | "Rented"
  | "Maintenance";

export interface EquipmentRecord {
  id: string;

  prefixId: string;

  assetNo: string;

  equipmentName: string;

  category: EquipmentCategory;

  maintenanceType: MaintenanceType;

  currentReading: number;

  projectId: string;

  operatorId: string;

  status: EquipmentStatus;

  /**
   * Soft Delete
   */
  deleted: boolean;

  deletedAt?: number;
}

export interface EquipmentFormData {
  prefixId: string;

  assetNo: string;

  equipmentName: string;

  category: EquipmentCategory | "";

  maintenanceType: MaintenanceType;

  currentReading: string;

  projectId: string;

  operatorId: string;
}