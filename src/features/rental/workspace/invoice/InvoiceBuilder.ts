import type {
    RentalAggregate,
  } from "@/features/rental/aggregate";
  
  import type {
    InvoiceSummary,
  } from "./types";
  import type { BillingStatement } from "@/features/rental/billingstatement/types";
  
  export function buildInvoiceSummary(
    aggregate: RentalAggregate,
    statements: BillingStatement[] = [],
  ): InvoiceSummary {
    const invoiced = statements
      .filter((statement) => statement.invoiceStatus !== "Not Invoiced" && statement.invoiceStatus !== "Cancelled")
      .sort((left, right) => {
        const byDate = Date.parse(right.invoiceStatusUpdatedAt ?? right.createdAt) - Date.parse(left.invoiceStatusUpdatedAt ?? left.createdAt);
        return byDate || right.statementNo.localeCompare(left.statementNo);
      });
    const latest = invoiced[0];
    return {
      invoiceCount: invoiced.length,
  
      totalInvoiced:
        aggregate.billing.invoiced,
  
      outstanding:
        aggregate.billing.outstanding,
  
      latestInvoiceNo: latest?.invoiceNumber?.trim() || latest?.statementNo,
  
      latestInvoiceDate: latest?.invoiceStatusUpdatedAt ?? latest?.createdAt,

    };
  }
