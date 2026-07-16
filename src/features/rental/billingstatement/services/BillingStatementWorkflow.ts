import type { RentalAggregate } from "@/features/rental/aggregate";
import type { BillingInvoiceStatus, BillingStatement } from "../types";
import { billingStatementRepository } from "../repository";
import { createBillingStatement } from "@/features/rental/workspace/billing/createBillingStatement";
import type { BillingPreviewLine } from "@/features/rental/workspace/billing/types";

type Result =
  | { success: true; statement: BillingStatement }
  | { success: false; message: string };

export function createBillingStatementForRental(
  aggregate: RentalAggregate,
  from: string,
  to: string,
  lines: BillingPreviewLine[]
): Result {
  if (["Cancelled", "Closed"].includes(aggregate.rental.status)) {
    return { success: false, message: "Cancelled or closed rentals cannot create billing statements." };
  }

  if (!aggregate.rental.id || !aggregate.equipment?.id || !aggregate.operator?.id || !aggregate.contract) {
    return { success: false, message: "Rental, equipment, operator, and active billing contract are required." };
  }

  if (!from || !to || from > to) {
    return { success: false, message: "Enter a valid billing period." };
  }

  if (lines.length === 0) {
    return { success: false, message: "Generate at least one billable DEUR line before creating a statement." };
  }

  const duplicate = billingStatementRepository.getByRentalId(aggregate.rental.id).some(
    (statement) =>
      statement.billingFrom === from &&
      statement.billingTo === to &&
      statement.invoiceStatus !== "Cancelled"
  );

  if (duplicate) {
    return { success: false, message: "A billing statement already exists for this rental and period." };
  }

  const statement = createBillingStatement(aggregate, from, to, lines);
  billingStatementRepository.create(statement);
  return { success: true, statement };
}

const invoiceTransitions: Record<BillingInvoiceStatus, BillingInvoiceStatus[]> = {
  "Not Invoiced": ["Invoiced"],
  "Invoiced": ["Partially Collected", "Fully Collected"],
  "Partially Collected": ["Fully Collected"],
  "Fully Collected": [],
  "Cancelled": [],
};

export function updateBillingInvoiceStatus(
  statementId: string,
  nextStatus: BillingInvoiceStatus
): Result {
  const statement = billingStatementRepository.getById(statementId);

  if (!statement) {
    return { success: false, message: "Billing statement not found." };
  }

  if (!invoiceTransitions[statement.invoiceStatus].includes(nextStatus)) {
    return { success: false, message: `Cannot change invoice status from ${statement.invoiceStatus} to ${nextStatus}.` };
  }

  const updated = { ...statement, invoiceStatus: nextStatus };
  billingStatementRepository.update(updated);
  return { success: true, statement: updated };
}
