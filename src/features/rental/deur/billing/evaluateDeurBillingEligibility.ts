import type { BillingMethod } from "@/features/rental/types/RentalContract";
import type { DeurRecord, DeurTotals } from "../types";
import { calculateDeurTotals } from "../services/calculateDeurTotals";
import { deriveDeurEventState } from "../services/deriveDeurEventState";

export type DeurBillingEligibilityReasonCode =
  | "ELIGIBLE"
  | "RECORD_NOT_CANONICAL"
  | "LEGACY_RECORD"
  | "RENTAL_LINK_MISSING"
  | "INVALID_EVENT_HISTORY"
  | "SHIFT_NOT_COMPLETED"
  | "OPEN_ACTIVITY"
  | "TOTALS_INVALID"
  | "NO_BILLABLE_ACTIVITY"
  | "NOT_ACKNOWLEDGED"
  | "REJECTED"
  | "BILLING_LOCKED"
  | "ALREADY_BILLED"
  | "UNSUPPORTED_BILLING_EVIDENCE"
  | "UNKNOWN_BILLING_METHOD";

export interface DeurBillingEvidence {
  totals: DeurTotals;
  billableMinutes: number;
  billingMethod?: BillingMethod;
}

export interface DeurBillingEligibilityResult {
  eligible: boolean;
  reasonCode: DeurBillingEligibilityReasonCode;
  reason: string;
  deurId: string;
  rentalId?: string;
  reportDate?: string;
  evidence?: DeurBillingEvidence;
  validationIssues: string[];
}

export interface EvaluateDeurBillingEligibilityInput {
  deur: DeurRecord;
  billingMethod?: BillingMethod;
}

const supportedBillingMethods = new Set<BillingMethod>([
  "Per Hour",
  "Per Day",
  "Per Week",
  "Per Month",
  "Per Cubic Meter",
  "One Lot",
]);

function ineligible(
  deur: DeurRecord,
  reasonCode: Exclude<DeurBillingEligibilityReasonCode, "ELIGIBLE">,
  reason: string,
  validationIssues: string[] = [],
): DeurBillingEligibilityResult {
  return {
    eligible: false,
    reasonCode,
    reason,
    deurId: deur.id,
    rentalId: deur.rentalId || undefined,
    reportDate: deur.reportDate ?? deur.workDate,
    validationIssues,
  };
}

/**
 * Evaluates persisted canonical DEUR evidence only. It neither creates charges
 * nor infers payment or invoice state.
 */
export function evaluateDeurBillingEligibility({
  deur,
  billingMethod,
}: EvaluateDeurBillingEligibilityInput): DeurBillingEligibilityResult {
  if (deur.legacy) {
    return ineligible(deur, "LEGACY_RECORD", "Legacy DEUR records cannot be used as canonical billing evidence.");
  }

  if (!Array.isArray(deur.events)) {
    return ineligible(deur, "RECORD_NOT_CANONICAL", "The DEUR has no canonical event history.");
  }

  if (!deur.rentalId?.trim()) {
    return ineligible(deur, "RENTAL_LINK_MISSING", "The DEUR is not linked to a rental.");
  }

  if (deur.billingLocked) {
    return ineligible(deur, "BILLING_LOCKED", "The DEUR is locked for billing.");
  }

  if (
    deur.status === "Billed"
    || Boolean(deur.billId?.trim())
    || Boolean(deur.billingStatementId?.trim())
  ) {
    return ineligible(deur, "ALREADY_BILLED", "The DEUR has already been consumed by billing.");
  }

  if (deur.status === "Rejected") {
    return ineligible(deur, "REJECTED", "Rejected DEUR records cannot be billed.");
  }

  if (deur.status !== "Acknowledged") {
    return ineligible(deur, "NOT_ACKNOWLEDGED", "The DEUR must be acknowledged before it can provide billing evidence.");
  }

  const eventState = deriveDeurEventState(deur);
  if (eventState.structuralIssues.length > 0) {
    return ineligible(deur, "INVALID_EVENT_HISTORY", "The DEUR event history is invalid.", eventState.structuralIssues);
  }

  if (eventState.shiftNotStarted || !eventState.shiftCompleted) {
    return ineligible(deur, "SHIFT_NOT_COMPLETED", "The DEUR shift must be completed before billing.");
  }

  if (eventState.hasOpenInterval || eventState.openPrimaryActivity) {
    return ineligible(deur, "OPEN_ACTIVITY", "All DEUR activities must be closed before billing.");
  }

  const calculation = calculateDeurTotals(deur.events);
  if (calculation.calculationIssues.length > 0) {
    return ineligible(deur, "TOTALS_INVALID", "The DEUR totals could not be calculated.", calculation.calculationIssues);
  }

  if (billingMethod && !supportedBillingMethods.has(billingMethod)) {
    return ineligible(deur, "UNKNOWN_BILLING_METHOD", "The DEUR billing method is not supported.");
  }

  if (billingMethod === "Per Cubic Meter") {
    return ineligible(deur, "UNSUPPORTED_BILLING_EVIDENCE", "The canonical DEUR model has no quantity evidence for Per Cubic Meter billing.");
  }

  const billableMinutes = calculation.totals.operationMinutes + calculation.totals.idleMinutes;
  const hasDayEvidence = calculation.totals.shiftMinutes > 0;
  const requiresTimedEvidence = !billingMethod || billingMethod === "Per Hour";
  if ((requiresTimedEvidence && billableMinutes <= 0) || (!requiresTimedEvidence && !hasDayEvidence)) {
    return ineligible(deur, "NO_BILLABLE_ACTIVITY", "The DEUR has no billable operational evidence.");
  }

  return {
    eligible: true,
    reasonCode: "ELIGIBLE",
    reason: "The acknowledged DEUR contains valid billing evidence.",
    deurId: deur.id,
    rentalId: deur.rentalId,
    reportDate: deur.reportDate ?? deur.workDate,
    evidence: { totals: calculation.totals, billableMinutes, billingMethod },
    validationIssues: [],
  };
}
