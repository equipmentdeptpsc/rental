export type EquipmentCategory =
  | "Moving Equipment"
  | "Non-Moving Equipment"
  | "Aerial Equipment"
  | "Light Equipment";

export interface PrefixRecord {
  id: string;

  /**
   * Existing field
   */
  code: string;

  /**
   * Existing field
   */
  description: string;

  /**
   * NEW
   * Category assigned to this numbering rule.
   * Optional for backward compatibility.
   */
  category?: EquipmentCategory;

  /**
   * Existing field
   */
  nextNumber: number;

  /**
   * Existing field
   */
  digits: number;

  /**
   * Existing field.
   * Will be removed in a later sprint.
   */
  active: boolean;
}