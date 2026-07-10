export interface CloseReadiness {
    canClose: boolean;
  
    hasOpenAssignment: boolean;
  
    hasPendingOperations: boolean;
  
    hasOutstandingBalance: boolean;
  
    hasUnbilledOperations: boolean;
  
    reasons: string[];
  }