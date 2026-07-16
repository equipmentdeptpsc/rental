import type { BillingInvoiceStatus } from "../types";

export function isInvoicePreparationComplete(
  status: BillingInvoiceStatus | undefined
): boolean {
  return status === "Invoiced" ||
    status === "Partially Collected" ||
    status === "Fully Collected";
}
