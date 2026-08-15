import type { RentalCommercialSnapshot } from "@/features/rental/types";

const commercialTermFields = [
  "billingMethod",
  "unitRate",
  "minimumBillableHours",
  "overtimeRate",
  "standbyRate",
  "mobilizationFee",
  "demobilizationFee",
  "fuelCharge",
  "operatorIncluded",
  "operatorRate",
  "taxRate",
  "withholdingTax",
  "contractAmount",
  "meterEvidenceRequirement",
  "currency",
] as const satisfies ReadonlyArray<keyof RentalCommercialSnapshot>;

export function hasDistinctLineCommercialTerms(
  line: RentalCommercialSnapshot | undefined,
  rental: RentalCommercialSnapshot | undefined,
): boolean {
  if (!line) return false;
  if (!rental) return true;
  return commercialTermFields.some((field) => line[field] !== rental[field]);
}
