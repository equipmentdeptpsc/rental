/**
 * ==========================================
 * Equipment Location
 * ==========================================
 */

export interface EquipmentLocationRecord {
  id: string;

  location: string;

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

export interface EquipmentLocationFormValues {
  location: string;

  description: string;

  active: boolean;
}

/**
 * ==========================================
 * Search Filter
 * ==========================================
 */

export interface EquipmentLocationFilter {
  keyword: string;

  includeDeleted?: boolean;
}