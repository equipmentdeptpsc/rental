/**
 * ==========================================
 * Equipment Status
 * ==========================================
 */

export interface EquipmentStatusRecord {
  id: string;

  status: string;

  description: string;

  active: boolean;

  deleted: boolean;

  deletedAt?: number;
}

/**
 * ==========================================
 * Form Model
 * ==========================================
 */

export interface EquipmentStatusFormValues {
  status: string;

  description: string;

  active: boolean;
}

/**
 * ==========================================
 * Search Filter
 * ==========================================
 */

export interface EquipmentStatusFilter {
  keyword: string;

  includeDeleted?: boolean;
}