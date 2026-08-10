import type {
  RentalLifecycleStatus,
  RentalRecord,
} from "../types";
import { isRentalType } from "../types";
import type { RentalBillingMethod, RentalBillingTerms, TransactionRelationship } from "../types";

export type RentalBillingTermsIssueCode =
  | "BILLING_TERMS_REQUIRED" | "UNIT_RATE_REQUIRED" | "UNIT_RATE_MUST_BE_POSITIVE"
  | "FIELD_NOT_FINITE" | "FIELD_NEGATIVE" | "WITHHOLDING_PERCENTAGE_OUT_OF_RANGE"
  | "TRANSACTION_RELATIONSHIP_REQUIRED" | "VAT_APPLICABILITY_REQUIRED"
  | "VAT_REQUIRED_FOR_NON_AFFILIATE" | "VAT_NOT_ALLOWED_FOR_AFFILIATE" | "INVALID_VAT_APPLICABILITY";
export type RentalBillingTermsValidation =
  | { valid: true; value?: RentalBillingTerms }
  | { valid: false; code: RentalBillingTermsIssueCode; message: string };
export type RentalBillingTermsNormalization =
  | { valid: true; value?: RentalBillingTerms; transactionRelationship?: TransactionRelationship }
  | { valid: false; code: "INVALID_NUMERIC_INPUT" | "INVALID_VAT_APPLICABILITY" | "INVALID_TRANSACTION_RELATIONSHIP"; message: string };

const supportedAutomatedMethods = new Set<RentalBillingMethod>(["Per Hour", "Per Day", "Per Week"]);
const optionalNumericFields = ["minimumBillableHours", "overtimeRate", "standbyRate", "mobilizationFee", "demobilizationFee", "fuelCharge", "operatorRate", "withholdingTax"] as const satisfies readonly (keyof RentalBillingTerms)[];

function normalizeNumber(value: unknown, field: string): number | undefined | RentalBillingTermsNormalization {
  if (value === undefined || value === null || (typeof value === "string" && value.trim() === "")) return undefined;
  const numeric = typeof value === "number" ? value : typeof value === "string" ? Number(value) : Number.NaN;
  return Number.isFinite(numeric) ? numeric : { valid: false, code: "INVALID_NUMERIC_INPUT", message: `${field} must be a finite number.` };
}

export function normalizeRentalBillingTermsInput(input: {
  transactionRelationship?: unknown;
  billingTerms?: Record<string, unknown> | RentalBillingTerms;
}): RentalBillingTermsNormalization {
  const relationship = input.transactionRelationship;
  if (relationship !== undefined && relationship !== "Affiliate" && relationship !== "Non-Affiliate") return { valid: false, code: "INVALID_TRANSACTION_RELATIONSHIP", message: "Transaction relationship is invalid." };
  if (!input.billingTerms) return { valid: true, transactionRelationship: relationship };
  const raw = input.billingTerms as Record<string, unknown>;
  const vat = raw.vatApplicability;
  if (vat !== undefined && vat !== "Applicable" && vat !== "Not Applicable") return { valid: false, code: "INVALID_VAT_APPLICABILITY", message: "VAT applicability is invalid." };
  const terms: RentalBillingTerms = vat === undefined ? {} : { vatApplicability: vat };
  for (const field of ["unitRate", ...optionalNumericFields] as const) {
    const normalized = normalizeNumber(raw[field], field);
    if (typeof normalized === "object") return normalized;
    if (normalized !== undefined) (terms as Record<string, number>)[field] = normalized;
  }
  return { valid: true, value: terms, transactionRelationship: relationship };
}

export function validateRentalBillingTerms(input: {
  billingMethod?: RentalBillingMethod;
  transactionRelationship?: TransactionRelationship;
  billingTerms?: RentalBillingTerms;
}): RentalBillingTermsValidation {
  const { billingMethod, transactionRelationship, billingTerms } = input;
  if (!billingTerms) return supportedAutomatedMethods.has(billingMethod!)
    ? { valid: false, code: "BILLING_TERMS_REQUIRED", message: "Rental billing terms are required for this billing method." }
    : { valid: true };
  if (!transactionRelationship) return { valid: false, code: "TRANSACTION_RELATIONSHIP_REQUIRED", message: "Transaction relationship is required for billing terms." };
  if (billingTerms.vatApplicability !== "Applicable" && billingTerms.vatApplicability !== "Not Applicable") return { valid: false, code: billingTerms.vatApplicability === undefined ? "VAT_APPLICABILITY_REQUIRED" : "INVALID_VAT_APPLICABILITY", message: "VAT applicability must be specified." };
  if (transactionRelationship === "Affiliate" && billingTerms.vatApplicability !== "Not Applicable") return { valid: false, code: "VAT_NOT_ALLOWED_FOR_AFFILIATE", message: "Affiliate transactions are not subject to VAT." };
  if (transactionRelationship === "Non-Affiliate" && billingTerms.vatApplicability !== "Applicable") return { valid: false, code: "VAT_REQUIRED_FOR_NON_AFFILIATE", message: "Non-affiliate transactions require VAT." };
  if (supportedAutomatedMethods.has(billingMethod!) && (!Number.isFinite(billingTerms.unitRate) || (billingTerms.unitRate ?? 0) <= 0)) return { valid: false, code: billingTerms.unitRate === undefined ? "UNIT_RATE_REQUIRED" : "UNIT_RATE_MUST_BE_POSITIVE", message: "Unit rate must be a finite positive number." };
  for (const field of optionalNumericFields) {
    const value = billingTerms[field];
    if (value === undefined) continue;
    if (!Number.isFinite(value)) return { valid: false, code: "FIELD_NOT_FINITE", message: `${field} must be finite.` };
    if (value < 0) return { valid: false, code: "FIELD_NEGATIVE", message: `${field} cannot be negative.` };
  }
  if (billingTerms.withholdingTax !== undefined && billingTerms.withholdingTax > 100) return { valid: false, code: "WITHHOLDING_PERCENTAGE_OUT_OF_RANGE", message: "Withholding tax must be between 0 and 100." };
  return { valid: true, value: { ...billingTerms } };
}

export function getRentalCommercialTermsError(
  rental: { rentalType?: unknown; billingMethod?: unknown }
): string | undefined {
  if (!isRentalType(rental.rentalType)) {
    return "Select a rental type before creating a rental.";
  }

  return undefined;
}

const allowedTransitions: Record<
  RentalLifecycleStatus,
  RentalLifecycleStatus[]
> = {
  Draft: ["Assigned", "Cancelled"],
  Assigned: ["Reserved", "Cancelled"],
  Reserved: ["Released", "Cancelled"],
  Released: ["Active"],
  Active: ["Returned"],
  Returned: ["Closed"],
  Closed: [],
  Cancelled: [],
};

const equipmentBlockingStatuses: RentalLifecycleStatus[] = [
  "Draft",
  "Assigned",
  "Reserved",
  "Released",
  "Active",
];

/** A rental in one of these states exclusively occupies its equipment. */
export function isEquipmentBlockingRental(rental: Pick<RentalRecord, "status">): boolean {
  return equipmentBlockingStatuses.includes(rental.status);
}

export function findEquipmentBlockingRental(
  rentals: RentalRecord[],
  equipmentId: string,
  excludeRentalId?: string,
): RentalRecord | undefined {
  return rentals.find((rental) =>
    rental.id !== excludeRentalId &&
    rental.equipmentId === equipmentId &&
    isEquipmentBlockingRental(rental)
  );
}

export function canTransitionRental(
  rental: { status: RentalLifecycleStatus },
  nextStatus: RentalLifecycleStatus
): boolean {
  return allowedTransitions[rental.status]
    .includes(nextStatus);
}

export function getRentalTransitionError(
  rental: { status: RentalLifecycleStatus },
  nextStatus: RentalLifecycleStatus
): string | undefined {
  if (canTransitionRental(rental, nextStatus)) {
    return undefined;
  }

  if (rental.status === "Closed") {
    return "Closed rentals are read-only.";
  }

  if (rental.status === "Cancelled") {
    return "Cancelled rentals cannot be changed.";
  }

  return `Rental cannot transition from ${rental.status} to ${nextStatus}.`;
}

export function isRentalLocked(rental: RentalRecord) {
  return rental.status === "Closed";
}

export function canEditRental(rental: RentalRecord) {
  return !isRentalLocked(rental);
}
