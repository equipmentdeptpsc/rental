/**
 * ==========================================
 * Equipment Condition
 * ==========================================
 */

export interface EquipmentConditionRecord {
  id: string;

  condition: string;

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

export interface EquipmentConditionFormValues {
  condition: string;

  description: string;

  active: boolean;
}

/**
 * ==========================================
 * Search Filter
 * ==========================================
 */

export interface EquipmentConditionFilter {
  keyword: string;

  includeDeleted?: boolean;
}