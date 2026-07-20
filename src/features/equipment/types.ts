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

  manufacturer?: string;

  model?: string;

  serialNumber?: string;

  engineNumber?: string;

  chassisNumber?: string;

  plateNumber?: string;

  yearModel?: number;

  capacity?: string;

  /* ===========================
     MASTER DATA
     =========================== */

  type?: string;
  typeId?: string;

  brand?: string;
  brandId?: string;

  category: EquipmentCategory;
  categoryId?: string;

  status: EquipmentStatus;
  statusId?: string;

  ownership?: string;
  ownershipId?: string;

  condition?: string;
  conditionId?: string;

  location?: string;
  locationId?: string;

  /** Optional master reference; operational snapshots are captured downstream. */
  costCodeId?: string;

  /* ===========================
     OPERATION
     =========================== */

  maintenanceType: MaintenanceType;

  currentReading: number;

  projectId: string;

  operatorId: string;

  remarks?: string;

  active?: boolean;

  deleted?: boolean;

  deletedAt?: number;
}

export interface EquipmentFormData {
  prefixId: string;

  assetNo: string;

  equipmentName: string;

  /* Master Data */

  typeId?: string;
  type?: string;

  brandId?: string;
  brand?: string;

  categoryId?: string;
  category: EquipmentCategory | "";

  statusId?: string;
  status?: EquipmentStatus;

  ownershipId?: string;
  ownership?: string;

  conditionId?: string;
  condition?: string;

  locationId?: string;
  location?: string;

  costCodeId?: string;

  /* Equipment Profile */

  manufacturer: string;

  model: string;

  serialNumber: string;

  engineNumber: string;

  chassisNumber: string;

  plateNumber: string;

  yearModel: string;

  capacity: string;

  /* Operation */

  maintenanceType: MaintenanceType;

  currentReading: string;

  projectId: string;

  operatorId: string;
}
