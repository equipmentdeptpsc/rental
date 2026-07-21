import type {
    BillingRecord,
  } from "../types";
import { createLegacyLocalRepositoryStorage } from "@/core/persistence";
  
  const persistence = createLegacyLocalRepositoryStorage("LegacyBilling");
  
  export const billingRepository = {
  
    getAll(): BillingRecord[] {
  
      return persistence.load<BillingRecord[]>() ?? [];
  
    },
  
    saveAll(
      records: BillingRecord[]
    ) {
  
      persistence.save(records);
  
    },
  
  };
