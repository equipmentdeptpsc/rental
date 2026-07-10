import type {
    RentalAggregate,
  } from "@/features/rental/aggregate";
  
  import type {
    BillingSummary,
  } from "./types";
  
  export function buildBillingSummary(
    aggregate: RentalAggregate
  ): BillingSummary {
    return {
      operatingCharge:
        aggregate.billing
          .totalOperatingCharge,
  
      idleCharge:
        aggregate.billing
          .totalIdleCharge,
  
      mobilizationCharge:
        aggregate.billing
          .totalMobilizationCharge,
  
      demobilizationCharge:
        aggregate.billing
          .totalDemobilizationCharge,
  
      adjustment:
        aggregate.billing
          .totalAdjustment,
  
      subtotal:
        aggregate.billing
          .subtotal,
  
      invoiced:
        aggregate.billing
          .invoiced,
  
      collected:
        aggregate.billing
          .collected,
  
      outstanding:
        aggregate.billing
          .outstanding,
    };
  }