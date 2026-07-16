import type {
    RentalAggregate,
  } from "@/features/rental/aggregate";
  
  import type {
    CloseReadiness,
  } from "./types";
  
  export function buildCloseReadiness(
    aggregate: RentalAggregate
  ): CloseReadiness {
    const reasons: string[] = [];
  
    const hasOpenAssignment =
      aggregate.assignment?.status ===
      "Active";
  
    if (hasOpenAssignment) {
      reasons.push(
        "Equipment assignment is still active."
      );
    }
  
    const hasPendingOperations =
      aggregate.activeDeur?.status !==
        undefined &&
      aggregate.activeDeur.status !==
        "Billed";
  
    if (hasPendingOperations) {
      reasons.push(
        "Daily operations are not yet finalized."
      );
    }
  
    const hasUnbilledOperations =
      !aggregate.billing.invoicePreparationComplete;

    if (hasUnbilledOperations) {
      reasons.push(
        aggregate.billing.hasStatement
          ? "Billing statement has not reached an invoiced status."
          : "A billing statement is required before closing."
      );
    }
  
    return {
      canClose:
        reasons.length === 0,
  
      hasOpenAssignment,
  
      hasPendingOperations,
  
      hasOutstandingBalance: false,
  
      hasUnbilledOperations,
  
      reasons,
    };
  }
