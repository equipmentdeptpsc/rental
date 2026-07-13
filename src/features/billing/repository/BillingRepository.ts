import type {
    BillingRecord,
  } from "../types";
  
  const STORAGE_KEY =
    "equipment-rental-billing";
  
  export const billingRepository = {
  
    getAll(): BillingRecord[] {
  
      const raw =
        localStorage.getItem(
          STORAGE_KEY
        );
  
      if (!raw) {
        return [];
      }
  
      return JSON.parse(raw);
  
    },
  
    saveAll(
      records: BillingRecord[]
    ) {
  
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify(records)
      );
  
    },
  
  };