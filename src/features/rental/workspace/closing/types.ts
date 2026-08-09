export interface CloseReadiness {
    canClose: boolean;
  
    hasOpenAssignment: boolean;
  
    hasPendingOperations: boolean;
  
    hasOutstandingBalance: boolean;
  
    hasUnbilledOperations: boolean;
  
    reasons: string[];
    checks: Array<{ code: string; satisfied: boolean; message: string; rentalEquipmentLineId?: string }>;
  }
