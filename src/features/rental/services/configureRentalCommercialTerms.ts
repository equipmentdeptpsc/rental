import type { RentalBillingTerms, RentalRecord, TransactionRelationship, VatApplicability } from "../types";
import { isRentalBillingMethod, isRentalType } from "../types";
import type { RentalContractRecord } from "../types/RentalContract";
import { normalizeRentalBillingTermsInput, validateRentalBillingTerms } from "./RentalWorkflowRules";
import { createRentalCommercialSnapshot } from "./createRentalCommercialSnapshot";

export interface RentalCommercialTermsInput {
  currency: string;
  unitRate: number;
  minimumBillableHours?: number;
  overtimeRate?: number;
  standbyRate?: number;
  mobilizationFee?: number;
  demobilizationFee?: number;
  fuelCharge?: number;
  operatorIncluded: boolean;
  operatorRate?: number;
  contractAmount?: number;
  taxRate?: number;
  withholdingTax?: number;
  transactionRelationship: TransactionRelationship;
  vatApplicability: VatApplicability;
  remarks?: string;
}

export type ConfigureRentalCommercialTermsResult =
  | { success: true; rental: RentalRecord; contract: RentalContractRecord }
  | { success: false; message: string };

export function canEditRentalCommercialTerms(rental: Pick<RentalRecord, "status">): boolean {
  return rental.status === "Draft" || rental.status === "Reserved";
}

export function configureRentalCommercialTerms(
  rental: RentalRecord,
  input: RentalCommercialTermsInput,
  timestamp: string,
): ConfigureRentalCommercialTermsResult {
  if (!canEditRentalCommercialTerms(rental)) {
    return { success: false, message: "Commercial terms are read-only after the Rental is released." };
  }
  if (!isRentalType(rental.rentalType) || !isRentalBillingMethod(rental.billingMethod)) {
    return { success: false, message: "Rental type and billing method must be configured first." };
  }
  if (!rental.customerId || !rental.projectId) {
    return { success: false, message: "Rental customer and project relationships are required." };
  }
  if (!Number.isFinite(Date.parse(timestamp))) {
    return { success: false, message: "Commercial terms timestamp is invalid." };
  }

  const rawTerms: RentalBillingTerms = {
    unitRate: input.unitRate,
    minimumBillableHours: input.minimumBillableHours,
    overtimeRate: input.overtimeRate,
    standbyRate: input.standbyRate,
    mobilizationFee: input.mobilizationFee,
    demobilizationFee: input.demobilizationFee,
    fuelCharge: input.fuelCharge,
    operatorRate: input.operatorRate,
    vatApplicability: input.vatApplicability,
    withholdingTax: input.withholdingTax,
  };
  const normalized = normalizeRentalBillingTermsInput({
    transactionRelationship: input.transactionRelationship,
    billingTerms: rawTerms,
  });
  if (!normalized.valid) return { success: false, message: normalized.message };
  const validated = validateRentalBillingTerms({
    billingMethod: rental.billingMethod,
    transactionRelationship: normalized.transactionRelationship,
    billingTerms: normalized.value,
  });
  if (!validated.valid) return { success: false, message: validated.message };

  const now = new Date(timestamp).toISOString();
  const contract: RentalContractRecord = {
    id: rental.id,
    contractNo: rental.rentalNumber ?? rental.id,
    customerId: rental.customerId,
    equipmentId: rental.equipmentId,
    projectId: rental.projectId,
    rentalType: rental.rentalType,
    billingMethod: rental.billingMethod === "Per Lot" ? "One Lot" : rental.billingMethod,
    currency: input.currency.trim().toUpperCase(),
    unitRate: input.unitRate,
    minimumBillableHours: input.minimumBillableHours,
    overtimeRate: input.overtimeRate,
    standbyRate: input.standbyRate,
    mobilizationFee: input.mobilizationFee,
    demobilizationFee: input.demobilizationFee,
    fuelCharge: input.fuelCharge,
    operatorIncluded: input.operatorIncluded,
    operatorRate: input.operatorRate,
    contractAmount: input.contractAmount,
    taxRate: input.taxRate,
    withholdingTax: input.withholdingTax,
    remarks: input.remarks?.trim() || undefined,
    startDate: rental.dateOut,
    expectedEndDate: rental.expectedReturn ?? rental.dateOut,
    status: "Active",
    createdAt: now,
    updatedAt: now,
  };
  const snapshotValidation = createRentalCommercialSnapshot(contract, now);
  if (!snapshotValidation.success) {
    return { success: false, message: snapshotValidation.issues[0]?.message ?? "Commercial terms are invalid." };
  }

  return {
    success: true,
    rental: {
      ...rental,
      transactionRelationship: normalized.transactionRelationship,
      billingTerms: validated.value,
    },
    contract,
  };
}
