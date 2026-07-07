import type {
    RentalContractRecord,
  } from "../types/RentalContract";
  
  export function updateRentalContract(
    existing: RentalContractRecord,
    changes: Partial<RentalContractRecord>
  ): RentalContractRecord {
  
    return {
      ...existing,
  
      ...changes,
  
      updatedAt:
        new Date().toISOString(),
    };
  }