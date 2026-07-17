import { BillingRateEngine, type BillingChargeResult } from "@/features/rental/billing/engine";
import { calculateDeurTotals } from "@/features/rental/deur/services/calculateDeurTotals";
import type { DeurRecord } from "@/features/rental/deur/types";
import type { RentalContractRecord, BillingMethod } from "@/features/rental/types/RentalContract";

/**
 * Canonical calculated evidence. It is structurally compatible with the
 * workspace preview adapter without making this domain service depend on it.
 */
export interface CalculatedDeurBillingStatementLine {
  id: string;
  deurId: string;
  workDate: string;
  operator: string;
  operatingHours: number;
  actualHours: number;
  billingMethod: BillingMethod;
  costCode: string;
  description: string;
  hourlyRate: number;
  amount: number;
}

export type CalculateDeurBillingStatementLineResult =
  | { success: true; line: CalculatedDeurBillingStatementLine; charges: BillingChargeResult }
  | { success: false; code: "INVALID_BILLING_METHOD" | "INVALID_DEUR_TOTALS" | "INVALID_NUMERIC_INPUT"; message: string };

const supportedBillingMethods = new Set<BillingMethod>([
  "Per Hour",
  "Per Day",
  "Per Week",
  "Per Month",
  "Per Cubic Meter",
  "One Lot",
]);

function hasValidNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function hasNonBlankText(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function hasValidContractNumbers(contract: RentalContractRecord) {
  return [
    contract.unitRate,
    contract.minimumBillableHours,
    contract.overtimeRate,
    contract.standbyRate,
    contract.mobilizationFee,
    contract.demobilizationFee,
    contract.fuelCharge,
    contract.operatorRate,
    contract.contractAmount,
    contract.taxRate,
    contract.withholdingTax,
  ].every((value) => value === undefined || hasValidNumber(value));
}

/**
 * Maps canonical DEUR duration evidence through the existing rate engine into
 * one serializable statement line. It does not decide billing eligibility.
 */
export function calculateDeurBillingStatementLine(
  deur: DeurRecord,
  contract: RentalContractRecord,
): CalculateDeurBillingStatementLineResult {
  if (!hasNonBlankText(deur.id)) {
    return { success: false, code: "INVALID_DEUR_TOTALS", message: "The DEUR identity is required for a billing statement line." };
  }

  if (!supportedBillingMethods.has(contract.billingMethod)) {
    return { success: false, code: "INVALID_BILLING_METHOD", message: "The billing method is not supported by the calculation engine." };
  }

  if (!hasValidContractNumbers(contract) || !hasValidNumber(deur.totalMobilizationMinutes) || !hasValidNumber(deur.totalDemobilizationMinutes)) {
    return { success: false, code: "INVALID_NUMERIC_INPUT", message: "Billing inputs must be finite non-negative numbers." };
  }

  const totals = calculateDeurTotals(deur.events ?? []);
  if (totals.calculationIssues.length > 0 || !Object.values(totals.totals).every(hasValidNumber)) {
    return { success: false, code: "INVALID_DEUR_TOTALS", message: "Canonical DEUR totals could not be calculated." };
  }

  const engineInput: DeurRecord = {
    ...deur,
    totalOperatingMinutes: totals.totals.operationMinutes,
    totalIdleMinutes: totals.totals.idleMinutes,
    totalMealBreakMinutes: totals.totals.mealBreakMinutes,
  };
  const charges = BillingRateEngine.calculate(engineInput, contract);
  if (!Object.values(charges).every(hasValidNumber)) {
    return { success: false, code: "INVALID_NUMERIC_INPUT", message: "The calculation engine returned an invalid charge value." };
  }

  return {
    success: true,
    charges,
    line: {
      id: deur.id,
      deurId: deur.id,
      workDate: deur.reportDate ?? deur.workDate,
      operator: deur.operatorId,
      operatingHours: charges.operatingHours,
      actualHours: charges.operatingHours,
      billingMethod: contract.billingMethod,
      costCode: "",
      description: `Equipment Rental (${contract.billingMethod})`,
      hourlyRate: contract.unitRate,
      amount: charges.subtotal,
    },
  };
}
