import { BillingRateEngine, type BillingCalculationMethod, type BillingCalculationTerms, type BillingChargeResult } from "@/features/rental/billing/engine";
import { calculateDeurTotals } from "@/features/rental/deur/services/calculateDeurTotals";
import type { DeurRecord } from "@/features/rental/deur/types";

/**
 * Canonical calculated evidence. It is structurally compatible with the
 * workspace preview adapter without making this domain service depend on it.
 */
export interface CalculatedDeurBillingStatementLine {
  id: string;
  deurId: string;
  deurRevisionChainId?: string;
  deurRevisionNumber?: number;
  effectiveDeurId?: string;
  correctedFromDeurId?: string;
  workDate: string;
  operator: string;
  operatingHours: number;
  actualHours: number;
  billingMethod: BillingCalculationMethod;
  activityCode?: string;
  quantity?: number;
  unit?: "km" | "trip" | "m³";
  unitRate?: number;
  commercialTermsSource?: "IMMUTABLE_SNAPSHOT" | "LEGACY_RENTAL_FALLBACK";
  commercialCapturedAt?: string;
  costCode: string;
  description: string;
  hourlyRate: number;
  amount: number;
}

export type CalculateDeurBillingStatementLineResult =
  | { success: true; line: CalculatedDeurBillingStatementLine; charges: BillingChargeResult }
  | { success: false; code: "INVALID_BILLING_METHOD" | "INVALID_DEUR_TOTALS" | "INVALID_NUMERIC_INPUT"; message: string };

const supportedBillingMethods = new Set<BillingCalculationMethod>([
  "Per Hour",
  "Per Day",
  "Per Week",
  "Per Month",
  "Per Kilometer",
  "Per Trip",
  "Per Cubic Meter",
  "One Lot",
]);

function hasValidNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function hasNonBlankText(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function hasValidTermsNumbers(terms: BillingCalculationTerms) {
  return [
    terms.unitRate,
    terms.minimumBillableHours,
    terms.overtimeRate,
    terms.standbyRate,
    terms.mobilizationFee,
    terms.demobilizationFee,
    terms.fuelCharge,
    terms.operatorRate,
    terms.contractAmount,
    terms.taxRate,
    terms.withholdingTax,
  ].every((value) => value === undefined || hasValidNumber(value));
}

/**
 * Maps canonical DEUR duration evidence through the existing rate engine into
 * one serializable statement line. It does not decide billing eligibility.
 */
export function calculateDeurBillingStatementLine(
  deur: DeurRecord,
  terms: BillingCalculationTerms,
): CalculateDeurBillingStatementLineResult {
  if (!hasNonBlankText(deur.id)) {
    return { success: false, code: "INVALID_DEUR_TOTALS", message: "The DEUR identity is required for a billing statement line." };
  }

  if (!supportedBillingMethods.has(terms.billingMethod)) {
    return { success: false, code: "INVALID_BILLING_METHOD", message: "The billing method is not supported by the calculation engine." };
  }

  if (!hasValidTermsNumbers(terms) || !hasValidNumber(deur.totalMobilizationMinutes) || !hasValidNumber(deur.totalDemobilizationMinutes)) {
    return { success: false, code: "INVALID_NUMERIC_INPUT", message: "Billing inputs must be finite non-negative numbers." };
  }

  const quantityBilling = terms.billingMethod === "Per Kilometer" || terms.billingMethod === "Per Trip" || terms.billingMethod === "Per Cubic Meter";
  const totals = calculateDeurTotals(deur.events ?? []);
  if (!quantityBilling && (totals.calculationIssues.length > 0 || !Object.values(totals.totals).every(hasValidNumber))) {
    return { success: false, code: "INVALID_DEUR_TOTALS", message: "Canonical DEUR totals could not be calculated." };
  }

  const engineInput: DeurRecord = {
    ...deur,
    totalOperatingMinutes: quantityBilling ? 0 : totals.totals.operationMinutes,
    totalIdleMinutes: quantityBilling ? 0 : totals.totals.idleMinutes,
    totalMealBreakMinutes: quantityBilling ? 0 : totals.totals.mealBreakMinutes,
  };
  const charges = BillingRateEngine.calculate(engineInput, terms);
  if (!Object.values(charges).every((value) => typeof value !== "number" || hasValidNumber(value))) {
    return { success: false, code: "INVALID_NUMERIC_INPUT", message: "The calculation engine returned an invalid charge value." };
  }

  return {
    success: true,
    charges,
    line: {
      id: deur.id,
      deurId: deur.id,
      deurRevisionChainId: deur.revision?.chainId,
      deurRevisionNumber: deur.revision?.revisionNumber,
      effectiveDeurId: deur.id,
      correctedFromDeurId: deur.revision?.previousRevisionId,
      workDate: deur.reportDate ?? deur.workDate,
      operator: deur.operatorId,
      operatingHours: charges.operatingHours,
      actualHours: charges.operatingHours,
      billingMethod: terms.billingMethod,
      activityCode: deur.operationalMetadata?.activityCode?.code,
      costCode: deur.operationalMetadata?.costCode?.code ?? "",
      description: deur.operationalMetadata?.workDescription?.name ?? `Equipment Rental (${terms.billingMethod})`,
      ...(charges.billingQuantity !== undefined && charges.billingUnit ? {
        quantity: charges.billingQuantity,
        unit: charges.billingUnit === "KILOMETER" ? "km" as const : charges.billingUnit === "TRIP" ? "trip" as const : "m³" as const,
        unitRate: terms.unitRate,
      } : {}),
      commercialTermsSource:deur.commercialSnapshot?"IMMUTABLE_SNAPSHOT":"LEGACY_RENTAL_FALLBACK",
      commercialCapturedAt:deur.commercialSnapshot?.capturedAt,
      hourlyRate: terms.unitRate,
      amount: charges.subtotal,
    },
  };
}
