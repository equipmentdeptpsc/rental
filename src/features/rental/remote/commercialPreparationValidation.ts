import type { DiscountType, RentalBillingMethod, TransactionRelationship, VatApplicability } from "@/features/rental/types";

export interface CommercialPreparationDraft {
  billingMethod: RentalBillingMethod;
  currency: string;
  unitRate: string;
  idleRate: string;
  standbyRate: string;
  discountType: DiscountType;
  discountValue: string;
  transactionRelationship: TransactionRelationship;
  vatApplicability: VatApplicability;
  taxRate: string;
  operatorIncluded: boolean;
  costCodeId: string;
  activityCodeId: string;
  workDescriptionId: string;
  remarks: string;
}

export type CommercialPreparationErrors = Partial<Record<keyof CommercialPreparationDraft, string>>;

/** Mirrors the existing client preflight; the canonical command remains authoritative. */
export function validateCommercialPreparationDraft(draft: CommercialPreparationDraft): CommercialPreparationErrors {
  const errors: CommercialPreparationErrors = {};
  if (!draft.costCodeId) errors.costCodeId = "Select a cost code.";
  if (!draft.activityCodeId) errors.activityCodeId = "Select an activity code.";
  if (!draft.workDescriptionId) errors.workDescriptionId = "Select a work description.";
  if (draft.unitRate.trim() === "" || !Number.isFinite(Number(draft.unitRate)) || Number(draft.unitRate) < 0) errors.unitRate = "Enter a non-negative unit rate.";
  for (const field of ["idleRate", "standbyRate"] as const) {
    if (draft[field] !== "" && (!Number.isFinite(Number(draft[field])) || Number(draft[field]) < 0)) errors[field] = "Enter a non-negative rate.";
  }
  const discount = Number(draft.discountValue);
  if (!Number.isFinite(discount) || discount < 0 || (draft.discountType === "PERCENTAGE" && discount > 100) || (draft.discountType === "NONE" && discount !== 0)) errors.discountValue = "Review the discount value for the selected type.";
  if ((draft.transactionRelationship === "Affiliate" && draft.vatApplicability !== "Not Applicable") || (draft.transactionRelationship === "Non-Affiliate" && draft.vatApplicability !== "Applicable")) errors.vatApplicability = "VAT must match the transaction relationship.";
  if (draft.taxRate !== "" && (!Number.isFinite(Number(draft.taxRate)) || Number(draft.taxRate) < 0)) errors.taxRate = "Enter a valid VAT rate.";
  if (draft.vatApplicability === "Applicable" && (draft.taxRate === "" || Number(draft.taxRate) <= 0 || Number(draft.taxRate) > 100)) errors.taxRate = "Enter a VAT rate above 0 and at most 100%.";
  return errors;
}
