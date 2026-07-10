import {
    useCloseReadiness,
  } from "./useCloseReadiness";
  
  import CloseRequirementItem from "./CloseRequirementItem";
  
  export default function CloseReadinessCard() {
    const readiness =
      useCloseReadiness();
  
    return (
      <div className="rounded-xl border bg-white p-6">
  
        <h2 className="text-xl font-semibold">
  
          Rental Close Checklist
  
        </h2>
  
        <div className="mt-6 space-y-3">
  
          <CloseRequirementItem
            label="Equipment Assignment Completed"
            completed={
              !readiness.hasOpenAssignment
            }
          />
  
          <CloseRequirementItem
            label="Operations Finalized"
            completed={
              !readiness.hasPendingOperations
            }
          />
  
          <CloseRequirementItem
            label="All Charges Invoiced"
            completed={
              !readiness.hasUnbilledOperations
            }
          />
  
          <CloseRequirementItem
            label="Outstanding Balance Cleared"
            completed={
              !readiness.hasOutstandingBalance
            }
          />
  
        </div>
  
      </div>
    );
  }