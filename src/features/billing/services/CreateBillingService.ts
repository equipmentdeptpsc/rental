import type { RentalRecord } from "@/features/rental/types";
import type { BillingRecord } from "../types";

export function createBilling(
  rental: RentalRecord
): BillingRecord {

  const today = new Date().toISOString();

  return {
    id: crypto.randomUUID(),

    statementNo: "",

    customerId: rental.customer,
customerName: rental.customer,

projectId: rental.project,
projectName: rental.project,

    billingFrom: today.split("T")[0],
    billingTo: today.split("T")[0],

    lines: [],

    totalAmount: 0,

    remarks: "",

    status: "Draft",

    createdAt: today,

    updatedAt: today,
  };
}