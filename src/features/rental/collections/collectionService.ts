import type { BillingStatement } from "../billingstatement/types";
import { billingStatementRepository } from "../billingstatement/repository";
import { collectionRepository } from "./repository";
import type { CollectionTransaction } from "./types";
import type { User } from "@/features/auth/domain/user";
import { assertMutationPermission } from "@/features/auth/services/assertMutationPermission";

export function reconcileStatementCollections(statement: BillingStatement, transactions: CollectionTransaction[]) {
  const invoiceTotal = Math.max(0, statement.grandTotal ?? statement.subtotal);
  const totalCollected = Math.min(invoiceTotal, transactions.filter((item) => item.statementId === statement.id && Number.isFinite(item.amount) && item.amount > 0).reduce((sum, item) => sum + item.amount, 0));
  return { invoiceTotal, totalCollected, outstandingBalance: Math.max(0, invoiceTotal - totalCollected) };
}

export function recordCollection(input: {
  statementId: string; mode: "partial" | "full"; amount?: number; paymentDate: string;
  referenceNumber: string; paymentMethod?: string; remarks?: string;
  actor: { id?: string; name: string }; authenticatedUser?: User | null; transactionId?: string; recordedAt?: string;
}) {
  assertMutationPermission(input.authenticatedUser, "collections.manage");
  const statement = billingStatementRepository.getById(input.statementId);
  if (!statement) return { success: false as const, message: "Billing statement not found." };
  if (!["Invoiced", "Partially Collected"].includes(statement.invoiceStatus)) return { success: false as const, message: "Only an invoiced statement with an outstanding balance can receive a Collection." };
  const current = reconcileStatementCollections(statement, collectionRepository.getByStatementId(statement.id));
  if (current.outstandingBalance <= 0) return { success: false as const, message: "This Invoice has no outstanding balance." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.paymentDate) || Number.isNaN(Date.parse(input.paymentDate))) return { success: false as const, message: "A valid Payment Date is required." };
  const referenceNumber = input.referenceNumber.trim();
  if (!referenceNumber) return { success: false as const, message: "Payment Reference Number is required." };
  const amount = input.mode === "full" ? current.outstandingBalance : Number(input.amount);
  if (!Number.isFinite(amount) || amount <= 0) return { success: false as const, message: "Collection amount must be greater than zero." };
  if (input.mode === "partial" && amount >= current.outstandingBalance) return { success: false as const, message: "A partial Collection must be less than the outstanding balance." };
  if (amount > current.outstandingBalance) return { success: false as const, message: "Collection amount cannot exceed the outstanding balance." };
  const transaction: CollectionTransaction = {
    id: input.transactionId ?? crypto.randomUUID(), statementId: statement.id, rentalId: statement.rentalId, amount,
    paymentDate: input.paymentDate, referenceNumber,
    ...(input.paymentMethod?.trim() ? { paymentMethod: input.paymentMethod.trim() } : {}),
    ...(input.remarks?.trim() ? { remarks: input.remarks.trim() } : {}),
    recordedBy: input.actor.name, ...(input.actor.id ? { recordedByUserId: input.actor.id } : {}),
    recordedAt: input.recordedAt ?? new Date().toISOString(),
  };
  try {
    collectionRepository.create(transaction);
    const after = reconcileStatementCollections(statement, collectionRepository.getByStatementId(statement.id));
    const invoiceStatus = after.outstandingBalance === 0 ? "Fully Collected" as const : "Partially Collected" as const;
    billingStatementRepository.update({ ...statement, invoiceStatus });
    return { success: true as const, transaction, totals: after, statement: { ...statement, invoiceStatus } };
  } catch (error) {
    return { success: false as const, message: error instanceof Error ? error.message : "Collection could not be persisted." };
  }
}
