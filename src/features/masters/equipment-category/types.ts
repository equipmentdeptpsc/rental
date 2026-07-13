/**
 * ==========================================
 * Equipment Category
 * ==========================================
 */

export interface EquipmentCategoryRecord {
  id: string;

  category: string;

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

export interface EquipmentCategoryFormValues {
  category: string;

  description: string;

  active: boolean;
}

/**
 * ==========================================
 * Search Filter
 * ==========================================
 */

export interface EquipmentCategoryFilter {
  keyword: string;

  includeDeleted?: boolean;
}