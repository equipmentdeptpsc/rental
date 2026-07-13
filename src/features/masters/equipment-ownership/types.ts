/**
 * ==========================================
 * Equipment Ownership
 * ==========================================
 */

export interface EquipmentOwnershipRecord {
  id: string;

  ownership: string;

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

export interface EquipmentOwnershipFormValues {
  ownership: string;

  description: string;

  active: boolean;
}

/**
 * ==========================================
 * Search Filter
 * ==========================================
 */

export interface EquipmentOwnershipFilter {
  keyword: string;

  includeDeleted?: boolean;
}