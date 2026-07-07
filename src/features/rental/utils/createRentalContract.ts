import type {
    RentalContractRecord,
  } from "../types/RentalContract";
  
  export function createRentalContract(
    data: Omit<
      RentalContractRecord,
      | "id"
      | "createdAt"
      | "updatedAt"
    >
  ): RentalContractRecord {
  
    const now =
      new Date().toISOString();
  
    return {
      id: crypto.randomUUID(),
  
      ...data,
  
      createdAt: now,
  
      updatedAt: now,
    };
  }