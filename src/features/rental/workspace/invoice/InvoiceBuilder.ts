import type {
    RentalAggregate,
  } from "@/features/rental/aggregate";
  
  import type {
    InvoiceSummary,
  } from "./types";
  
  export function buildInvoiceSummary(
    aggregate: RentalAggregate
  ): InvoiceSummary {
    return {
      invoiceCount:
        aggregate.billing.invoiced > 0
          ? 1
          : 0,
  
      totalInvoiced:
        aggregate.billing.invoiced,
  
      outstanding:
        aggregate.billing.outstanding,
  
      latestInvoiceNo:
        undefined,
  
      latestInvoiceDate:
        undefined,
    };
  }