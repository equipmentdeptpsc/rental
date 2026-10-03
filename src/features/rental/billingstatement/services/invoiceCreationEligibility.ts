import type { BillingStatement } from "../types";

export interface InvoiceCreationEligibility {
  eligible: boolean;
  reason?: string;
}

export function getInvoiceCreationEligibility(
  statement: BillingStatement,
  canUpdateBilling: boolean,
): InvoiceCreationEligibility {
  if (!canUpdateBilling) return { eligible: false, reason: "Billing update permission is required." };
  if (statement.approvalStatus !== "Approved") return { eligible: false, reason: "Only an approved billing statement can be invoiced." };
  if (statement.invoiceStatus !== "Not Invoiced") return { eligible: false, reason: "This billing statement already has an invoice state." };
  if (statement.lines.length === 0 || statement.lines.some((line) => !line.deurId || !Number.isFinite(line.amount) || line.amount < 0)) {
    return { eligible: false, reason: "At least one valid billable statement line is required." };
  }
  return { eligible: true };
}
