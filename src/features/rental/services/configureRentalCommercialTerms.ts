import type { RentalBillingMethod, RentalBillingTerms, RentalRecord, TransactionRelationship, VatApplicability } from "../types";
import { isRentalBillingMethod, isRentalType } from "../types";
import type { RentalContractRecord } from "../types/RentalContract";
import type { RentalEquipmentLine } from "../equipment-line";
import { normalizeRentalBillingTermsInput, validateRentalBillingTerms } from "./RentalWorkflowRules";
import { createRentalCommercialSnapshot } from "./createRentalCommercialSnapshot";

export interface RentalCommercialTermsInput {
  billingMethod: RentalBillingMethod;
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
  | { success: true; contract: RentalContractRecord }
  | { success: false; code: string; message: string };

export function canEditRentalCommercialTerms(rental: Pick<RentalRecord, "status">): boolean {
  return rental.status === "Draft" || rental.status === "Reserved";
}

export function configureRentalCommercialTerms(input: {
  rental: RentalRecord;
  line: RentalEquipmentLine;
  equipmentId: string;
  commercialTerms: RentalCommercialTermsInput;
  existingContract?: RentalContractRecord;
  timestamp: string;
}): ConfigureRentalCommercialTermsResult {
  const { rental, line, equipmentId, commercialTerms, existingContract, timestamp } = input;
  if (line.rentalId !== rental.id) return { success: false, code: "LINE_RENTAL_MISMATCH", message: "Rental Equipment Line does not belong to this Rental." };
  if (line.equipmentId !== equipmentId) return { success: false, code: "LINE_EQUIPMENT_MISMATCH", message: "Equipment does not match this Rental Equipment Line." };
  if (existingContract && (existingContract.rentalId !== rental.id || existingContract.rentalEquipmentLineId !== line.id || existingContract.equipmentId !== line.equipmentId)) {
    return { success: false, code: "CONTRACT_LINE_MISMATCH", message: "Commercial terms record does not match this Rental Equipment Line." };
  }
  if (!canEditRentalCommercialTerms(rental) || line.commercialSnapshot) {
    return { success: false, code: "COMMERCIAL_TERMS_READ_ONLY", message: "Commercial terms are read-only after the Rental is released." };
  }
  if (!isRentalType(rental.rentalType) || !isRentalBillingMethod(commercialTerms.billingMethod)) {
    return { success: false, code: "COMMERCIAL_IDENTITY_INVALID", message: "Rental type and billing method must be configured first." };
  }
  if (!rental.customerId || !rental.projectId) return { success: false, code: "RENTAL_RELATIONSHIP_MISSING", message: "Rental customer and project relationships are required." };
  if (!Number.isFinite(Date.parse(timestamp))) return { success: false, code: "COMMERCIAL_TIMESTAMP_INVALID", message: "Commercial terms timestamp is invalid." };

  const rawTerms: RentalBillingTerms = {
    unitRate: commercialTerms.unitRate, minimumBillableHours: commercialTerms.minimumBillableHours,
    overtimeRate: commercialTerms.overtimeRate, standbyRate: commercialTerms.standbyRate,
    mobilizationFee: commercialTerms.mobilizationFee, demobilizationFee: commercialTerms.demobilizationFee,
    fuelCharge: commercialTerms.fuelCharge, operatorRate: commercialTerms.operatorRate,
    vatApplicability: commercialTerms.vatApplicability, withholdingTax: commercialTerms.withholdingTax,
  };
  const normalized = normalizeRentalBillingTermsInput({ transactionRelationship: commercialTerms.transactionRelationship, billingTerms: rawTerms });
  if (!normalized.valid) return { success: false, code: normalized.code, message: normalized.message };
  const validated = validateRentalBillingTerms({ billingMethod: commercialTerms.billingMethod, transactionRelationship: normalized.transactionRelationship, billingTerms: normalized.value });
  if (!validated.valid) return { success: false, code: validated.code, message: validated.message };

  const now = new Date(timestamp).toISOString();
  const contract: RentalContractRecord = {
    id: existingContract?.id ?? `rental-contract:${line.id}`,
    rentalId: rental.id,
    rentalEquipmentLineId: line.id,
    contractNo: existingContract?.contractNo ?? rental.rentalNumber ?? rental.id,
    customerId: rental.customerId,
    equipmentId: line.equipmentId,
    projectId: rental.projectId,
    rentalType: rental.rentalType,
    billingMethod: commercialTerms.billingMethod === "Per Lot" ? "One Lot" : commercialTerms.billingMethod,
    currency: commercialTerms.currency.trim().toUpperCase(), unitRate: commercialTerms.unitRate,
    minimumBillableHours: commercialTerms.minimumBillableHours, overtimeRate: commercialTerms.overtimeRate,
    standbyRate: commercialTerms.standbyRate, mobilizationFee: commercialTerms.mobilizationFee,
    demobilizationFee: commercialTerms.demobilizationFee, fuelCharge: commercialTerms.fuelCharge,
    operatorIncluded: commercialTerms.operatorIncluded, operatorRate: commercialTerms.operatorRate,
    contractAmount: commercialTerms.contractAmount, taxRate: commercialTerms.taxRate,
    withholdingTax: commercialTerms.withholdingTax, transactionRelationship: commercialTerms.transactionRelationship,
    vatApplicability: commercialTerms.vatApplicability, remarks: commercialTerms.remarks?.trim() || undefined,
    startDate: rental.dateOut, expectedEndDate: rental.expectedReturn ?? rental.dateOut, status: "Active",
    createdAt: existingContract?.createdAt ?? now, updatedAt: now,
  };
  const snapshotValidation = createRentalCommercialSnapshot(contract, now);
  if (!snapshotValidation.success) return { success: false, code: snapshotValidation.issues[0]?.code ?? "COMMERCIAL_TERMS_INVALID", message: snapshotValidation.issues[0]?.message ?? "Commercial terms are invalid." };
  return { success: true, contract };
}
