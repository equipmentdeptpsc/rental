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
  
    const hasOutstandingBalance =
      aggregate.billing.outstanding >
      0;
  
    if (hasOutstandingBalance) {
      reasons.push(
        "Outstanding balance exists."
      );
    }
  
    const hasUnbilledOperations =
      aggregate.billing.subtotal >
        aggregate.billing.invoiced;
  
    if (hasUnbilledOperations) {
      reasons.push(
        "There are billable charges that have not yet been invoiced."
      );
    }
  
    return {
      canClose:
        reasons.length === 0,
  
      hasOpenAssignment,
  
      hasPendingOperations,
  
      hasOutstandingBalance,
  
      hasUnbilledOperations,
  
      reasons,
    };
  }