/**
 * ==========================================
 * Equipment Type
 * ==========================================
 */

export interface EquipmentTypeRecord {
    id: string;
  
    equipmentType: string;
  
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
  
  export interface EquipmentTypeFormValues {
    equipmentType: string;
  
    description: string;
  
    active: boolean;
  }
  
  /**
   * ==========================================
   * Search Filter
   * ==========================================
   */
  
  export interface EquipmentTypeFilter {
    keyword: string;
  
    includeDeleted?: boolean;
  }