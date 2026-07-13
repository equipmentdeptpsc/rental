/**
 * ==========================================
 * Equipment Brand
 * ==========================================
 */

export interface EquipmentBrandRecord {
  id: string;

  brand: string;

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

export interface EquipmentBrandFormValues {
  brand: string;

  description: string;

  active: boolean;
}

/**
 * ==========================================
 * Search Filter
 * ==========================================
 */

export interface EquipmentBrandFilter {
  keyword: string;

  includeDeleted?: boolean;
}