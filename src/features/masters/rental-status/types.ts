/**
 * ==========================================
 * Rental Status
 * ==========================================
 */

export interface RentalStatusRecord {
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
  
  export interface RentalStatusFormValues {
    status: string;
  
    description: string;
  
    active: boolean;
  }
  
  /**
   * ==========================================
   * Search Filter
   * ==========================================
   */
  
  export interface RentalStatusFilter {
    keyword: string;
  
    includeDeleted?: boolean;
  }