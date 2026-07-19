import type { BillingCalculationTerms, BillingChargeResult } from "@/features/rental/billing/engine";
import { calculateDeurBillingStatementLine } from "@/features/rental/billingstatement/services/calculateDeurBillingStatementLine";
import type { CanonicalDeurEvent, DeurRecord } from "../types";
import { calculateDeurTotals } from "../services/calculateDeurTotals";
import { deriveDeurEventState } from "../services/deriveDeurEventState";
import { evaluateDeurBillingEligibility, type DeurBillingEligibilityReasonCode } from "./evaluateDeurBillingEligibility";

export type DeurBillingPreviewStatus = "available" | "provisional" | "not-calculable" | "ineligible";
export interface DeurBillingPreviewIssue { code: string; message: string; field?: string }
export interface DeurBillingPreview {
  status: DeurBillingPreviewStatus;
  calculatedAt: string;
  billingMethod: BillingCalculationTerms["billingMethod"];
  eligibility: { eligible: boolean; reasonCodes: DeurBillingEligibilityReasonCode[] };
  evidence: {
    operatingMinutes: number; idleMinutes: number; mobilizationMinutes: number; demobilizationMinutes: number;
    hasRunningActivity: boolean; completedShift: boolean;
  };
  rates: Omit<BillingCalculationTerms, "billingMethod" | "operatorIncluded"> & { operatorIncluded: boolean };
  charges?: BillingChargeResult;
  issues: DeurBillingPreviewIssue[];
  disclaimer?: string;
}
export interface CreateDeurBillingPreviewInput { deur: DeurRecord; terms: BillingCalculationTerms; evaluatedAt?: string | Date }

const provisionalCodes = new Set<DeurBillingEligibilityReasonCode>(["NOT_ACKNOWLEDGED", "SHIFT_NOT_COMPLETED", "OPEN_ACTIVITY"]);
const numericFields: Array<keyof Omit<BillingCalculationTerms, "billingMethod" | "operatorIncluded">> = [
  "unitRate", "minimumBillableHours", "overtimeRate", "standbyRate", "mobilizationFee", "demobilizationFee",
  "fuelCharge", "operatorRate", "taxRate", "withholdingTax", "contractAmount",
];

function closeOpenEvents(events: CanonicalDeurEvent[], evaluatedAt: Date): CanonicalDeurEvent[] {
  const result = structuredClone(events).sort((a, b) => a.sequence - b.sequence);
  const open = new Map<CanonicalDeurEvent["activityType"], CanonicalDeurEvent>();
  result.forEach((event) => event.action === "start" ? open.set(event.activityType, event) : open.delete(event.activityType));
  let sequence = Math.max(0, ...result.map((event) => event.sequence));
  const close = (activityType: CanonicalDeurEvent["activityType"]) => {
    const start = open.get(activityType); if (!start) return;
    const startedAt = Date.parse(start.timestamp); const evaluation = evaluatedAt.getTime();
    const timestamp = new Date(Number.isFinite(startedAt) ? Math.max(startedAt, evaluation) : evaluation).toISOString();
    result.push({ id: `preview-${activityType}-end`, activityType, action: "end", timestamp, sequence: ++sequence, source: "automatic" });
  };
  (["operation", "idle", "mealBreak"] as const).forEach(close);
  close("shift");
  return result;
}

function configurationIssues(terms: BillingCalculationTerms): DeurBillingPreviewIssue[] {
  const issues: DeurBillingPreviewIssue[] = [];
  numericFields.forEach((field) => {
    const value = terms[field];
    if (value !== undefined && (!Number.isFinite(value) || value < 0)) issues.push({ code: "INVALID_RATE", message: `${field} must be a finite non-negative value.`, field });
  });
  if (terms.billingMethod === "One Lot") {
    if (!(Number.isFinite(terms.contractAmount) && terms.contractAmount! > 0)) issues.push({ code: "CONTRACT_AMOUNT_REQUIRED", message: "A positive contract amount is required for One Lot billing.", field: "contractAmount" });
  } else if (terms.billingMethod !== "Per Cubic Meter" && !(Number.isFinite(terms.unitRate) && terms.unitRate > 0)) {
    issues.push({ code: "UNIT_RATE_REQUIRED", message: "A positive billing unit rate is required.", field: "unitRate" });
  }
  return issues;
}

export function createDeurBillingPreview({ deur, terms, evaluatedAt = new Date() }: CreateDeurBillingPreviewInput): DeurBillingPreview {
  const calculatedAt = new Date(evaluatedAt);
  const eventState = deriveDeurEventState(deur);
  const hasRunningActivity = eventState.hasOpenInterval || Boolean(eventState.openPrimaryActivity);
  const evidenceEvents = hasRunningActivity && Array.isArray(deur.events) ? closeOpenEvents(deur.events, calculatedAt) : structuredClone(deur.events ?? []);
  const totals = calculateDeurTotals(evidenceEvents).totals;
  const eligibility = evaluateDeurBillingEligibility({ deur, billingMethod: terms.billingMethod });
  const issues = configurationIssues(terms);
  const base: DeurBillingPreview = {
    status: "ineligible", calculatedAt: calculatedAt.toISOString(), billingMethod: terms.billingMethod,
    eligibility: { eligible: eligibility.eligible, reasonCodes: [eligibility.reasonCode] },
    evidence: {
      operatingMinutes: totals.operationMinutes, idleMinutes: totals.idleMinutes,
      mobilizationMinutes: Math.max(0, deur.totalMobilizationMinutes), demobilizationMinutes: Math.max(0, deur.totalDemobilizationMinutes),
      hasRunningActivity, completedShift: eventState.shiftCompleted,
    },
    rates: structuredClone({
      unitRate: terms.unitRate, minimumBillableHours: terms.minimumBillableHours, overtimeRate: terms.overtimeRate,
      standbyRate: terms.standbyRate, mobilizationFee: terms.mobilizationFee, demobilizationFee: terms.demobilizationFee,
      fuelCharge: terms.fuelCharge, operatorIncluded: terms.operatorIncluded, operatorRate: terms.operatorRate,
      taxRate: terms.taxRate, withholdingTax: terms.withholdingTax, contractAmount: terms.contractAmount,
    }),
    issues: [...issues, ...eligibility.validationIssues.map((message) => ({ code: "INVALID_EVENT_HISTORY", message }))],
  };
  if (terms.billingMethod === "Per Cubic Meter") {
    return { ...base, status: "not-calculable", issues: [...base.issues, { code: "QUANTITY_REQUIRED", message: "Canonical DEUR evidence does not include cubic-meter quantity.", field: "quantity" }] };
  }
  if (issues.length > 0) return { ...base, status: "not-calculable" };
  const provisional = !eligibility.eligible && hasRunningActivity && provisionalCodes.has(eligibility.reasonCode) && eventState.structuralIssues.length === 0;
  if (!eligibility.eligible && !provisional) return base;
  const calculated = calculateDeurBillingStatementLine({ ...structuredClone(deur), events: evidenceEvents }, structuredClone(terms));
  if (!calculated.success) return { ...base, status: "not-calculable", issues: [...base.issues, { code: calculated.code, message: calculated.message }] };
  return {
    ...base,
    status: provisional ? "provisional" : "available",
    charges: structuredClone(calculated.charges),
    disclaimer: provisional ? "Live estimate only. Charges may change until the shift is completed and acknowledged." : undefined,
  };
}
