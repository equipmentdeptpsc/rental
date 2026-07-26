import type { BillingMethod } from "@/features/rental/types/RentalContract";
import type { DeurRecord, DeurTotals } from "../types";
import { calculateDeurTotals } from "../services/calculateDeurTotals";
import { deriveDeurEventState } from "../services/deriveDeurEventState";
import { buildDeurOdometerTripEvidence } from "../services/buildDeurOdometerTripEvidence";
import { resolveDeurEvidenceMode } from "../services/resolveDeurEvidenceMode";
import { resolveEffectiveDeurRevision } from "../services/correction/resolveEffectiveDeurRevision";

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
  | "EVIDENCE_MODE_MISMATCH"
  | "BILLING_METHOD_SNAPSHOT_MISMATCH"
  | "ODOMETER_EVIDENCE_NOT_CAPTURED"
  | "ODOMETER_EVIDENCE_INVALID"
  | "TOTAL_DISTANCE_REQUIRED"
  | "TRIP_COUNT_REQUIRED"
  | "UNIT_RATE_NOT_CONFIGURED"
  | "UNIT_RATE_INVALID"
  | "COMMERCIAL_SNAPSHOT_NOT_CAPTURED"
  | "COMMERCIAL_BILLING_METHOD_MISMATCH"
  | "COMMERCIAL_TERMS_MISMATCH"
  | "QUANTITY_REQUIRED"
  | "QUANTITY_INVALID"
  | "COMMERCIAL_RATE_INVALID"
  | "DEUR_REVISION_SUPERSEDED"
  | "DEUR_CORRECTION_PENDING"
  | "DEUR_REVISION_CHAIN_INVALID"
  | "DEUR_REVISION_ALREADY_CONSUMED"
  | "DEUR_REVISION_NOT_EFFECTIVE"
  | "UNKNOWN_BILLING_METHOD";

export interface DeurBillingEvidence {
  totals: DeurTotals;
  billableMinutes: number;
  billingMethod?: BillingMethod;
  totalDistance?: number;
  tripCount?: number;
  quantity?: number;
  quantityUnit?: "CUBIC_METER";
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
  unitRate?: number;
  revisionChain?: DeurRecord[];
}

const supportedBillingMethods = new Set<BillingMethod>([
  "Per Hour",
  "Per Day",
  "Per Week",
  "Per Month",
  "Per Kilometer",
  "Per Trip",
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
  unitRate,
  revisionChain,
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
  if (deur.revision?.supersededByRevisionId) {
    return ineligible(deur, "DEUR_REVISION_SUPERSEDED", "This DEUR revision has been superseded.");
  }

  if (revisionChain?.length && (Boolean(deur.revision) || revisionChain.length > 1)) {
    if (
      revisionChain.some(
        (record) =>
          record.billingLocked ||
          Boolean(record.billingStatementId?.trim()) ||
          Boolean(record.billId?.trim()) ||
          record.status === "Billed",
      )
    ) {
      return ineligible(
        deur,
        "DEUR_REVISION_ALREADY_CONSUMED",
        "A DEUR revision in this correction chain has already been consumed by billing.",
      );
    }

    const resolution = resolveEffectiveDeurRevision(revisionChain);
    if (!resolution.valid) {
      return ineligible(
        deur,
        "DEUR_REVISION_CHAIN_INVALID",
        "The DEUR revision chain is invalid.",
        resolution.issues.map((issue) => issue.message),
      );
    }
    if (resolution.pendingCorrection) {
      return ineligible(
        deur,
        "DEUR_CORRECTION_PENDING",
        "Billing is unavailable while a correction is awaiting resolution.",
      );
    }
    if (resolution.currentEffective && resolution.currentEffective.id !== deur.id) {
      return ineligible(
        deur,
        "DEUR_REVISION_NOT_EFFECTIVE",
        "Only the current effective DEUR revision may be billed.",
      );
    }
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

  if (billingMethod && !supportedBillingMethods.has(billingMethod)) {
    return ineligible(deur, "UNKNOWN_BILLING_METHOD", "The DEUR billing method is not supported.");
  }
  if(deur.commercialSnapshotRequired&&!deur.commercialSnapshot)return ineligible(deur,"COMMERCIAL_SNAPSHOT_NOT_CAPTURED","Immutable commercial terms were not captured for this DEUR.");
  if(deur.commercialSnapshot){
    const snapshotMethod=deur.commercialSnapshot.billingMethod;
    if(billingMethod&&snapshotMethod!==billingMethod)return ineligible(deur,"COMMERCIAL_TERMS_MISMATCH","The supplied billing method does not match the immutable commercial snapshot.");
    if(deur.billingMethodSnapshot&&snapshotMethod!==deur.billingMethodSnapshot)return ineligible(deur,"COMMERCIAL_BILLING_METHOD_MISMATCH","The DEUR billing method does not match its immutable commercial snapshot.");
    const resolved=resolveDeurEvidenceMode(snapshotMethod);
    if(resolved.supported&&deur.evidenceMode&&resolved.mode!==deur.evidenceMode)return ineligible(deur,"EVIDENCE_MODE_MISMATCH","The DEUR evidence mode does not match its immutable commercial snapshot.");
  }

  if (billingMethod === "Per Cubic Meter") {
    if(deur.evidenceMode!=="QUANTITY")return ineligible(deur,"EVIDENCE_MODE_MISMATCH","The DEUR evidence mode does not match Per Cubic Meter billing.");
    if(deur.billingMethodSnapshot?.trim()&&deur.billingMethodSnapshot!=="Per Cubic Meter")return ineligible(deur,"COMMERCIAL_BILLING_METHOD_MISMATCH","The DEUR billing method snapshot does not match Per Cubic Meter billing.");
    if(!deur.quantityEvidence)return ineligible(deur,"QUANTITY_REQUIRED","Cubic-meter quantity evidence is required.");
    if(!Number.isFinite(deur.quantityEvidence.quantity)||deur.quantityEvidence.quantity<=0||deur.quantityEvidence.unit!=="CUBIC_METER")return ineligible(deur,"QUANTITY_INVALID","Cubic-meter quantity must be finite and greater than zero.");
    if(!Number.isFinite(unitRate)||unitRate===undefined||unitRate<=0)return ineligible(deur,"COMMERCIAL_RATE_INVALID","The immutable rate per cubic meter must be finite and greater than zero.");
    return{eligible:true,reasonCode:"ELIGIBLE",reason:"The acknowledged DEUR contains valid cubic-meter billing evidence.",deurId:deur.id,rentalId:deur.rentalId,reportDate:deur.reportDate??deur.workDate,evidence:{totals:structuredClone(deur.totals??{shiftMinutes:0,operationMinutes:0,idleMinutes:0,mealBreakMinutes:0,breakdownMinutes:0}),billableMinutes:0,billingMethod,quantity:deur.quantityEvidence.quantity,quantityUnit:"CUBIC_METER"},validationIssues:[]};
  }

  if (billingMethod === "Per Kilometer" || billingMethod === "Per Trip") {
    if (deur.evidenceMode !== "ODOMETER_TRIP") return ineligible(deur, "EVIDENCE_MODE_MISMATCH", "The DEUR evidence mode does not match the rental billing method.");
    if (deur.billingMethodSnapshot?.trim() && deur.billingMethodSnapshot !== billingMethod) return ineligible(deur, "BILLING_METHOD_SNAPSHOT_MISMATCH", "The DEUR billing-method snapshot does not match the rental billing method.");
    if (!deur.odometerTripEvidence) return ineligible(deur, "ODOMETER_EVIDENCE_NOT_CAPTURED", "Odometer/trip evidence was not captured for this DEUR.");
    if (unitRate === undefined) return ineligible(deur, "UNIT_RATE_NOT_CONFIGURED", "A billing unit rate is required.");
    if (!Number.isFinite(unitRate) || unitRate <= 0) return ineligible(deur, "UNIT_RATE_INVALID", "The billing unit rate must be finite and greater than zero.");
    const rebuilt = buildDeurOdometerTripEvidence(deur.odometerTripEvidence.checkpoints);
    if (!rebuilt.success) return ineligible(deur, "ODOMETER_EVIDENCE_INVALID", "The odometer/trip evidence is invalid.", rebuilt.issues);
    const persisted = deur.odometerTripEvidence;
    const derived = rebuilt.evidence;
    const consistent = persisted.checkpoints.length === derived.checkpoints.length
      && persisted.segments.length === derived.segments.length
      && persisted.segments.every((segment, index) => {
        const expected = derived.segments[index];
        return segment.startCheckpointId === expected.startCheckpointId && segment.endCheckpointId === expected.endCheckpointId
          && segment.startOdometer === expected.startOdometer && segment.endOdometer === expected.endOdometer
          && segment.distance === expected.distance;
      })
      && persisted.startingOdometer === derived.startingOdometer && persisted.endingOdometer === derived.endingOdometer
      && persisted.totalDistance === derived.totalDistance && persisted.tripCount === derived.tripCount;
    if (!consistent) return ineligible(deur, "ODOMETER_EVIDENCE_INVALID", "Persisted odometer/trip totals do not match the canonical checkpoints.");
    if (billingMethod === "Per Kilometer" && (!Number.isFinite(persisted.totalDistance) || persisted.totalDistance <= 0)) return ineligible(deur, "TOTAL_DISTANCE_REQUIRED", "A positive total distance is required.");
    if (billingMethod === "Per Trip" && (!Number.isInteger(persisted.tripCount) || persisted.tripCount <= 0)) return ineligible(deur, "TRIP_COUNT_REQUIRED", "A positive whole-number trip count is required.");
    return {
      eligible: true, reasonCode: "ELIGIBLE", reason: "The acknowledged DEUR contains valid odometer/trip billing evidence.",
      deurId: deur.id, rentalId: deur.rentalId, reportDate: deur.reportDate ?? deur.workDate,
      evidence: { totals: structuredClone(deur.totals ?? { shiftMinutes: 0, operationMinutes: 0, idleMinutes: 0, mealBreakMinutes: 0, breakdownMinutes: 0 }), billableMinutes: 0, billingMethod, totalDistance: persisted.totalDistance, tripCount: persisted.tripCount },
      validationIssues: [],
    };
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
