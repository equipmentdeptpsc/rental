import type { AssignmentRecord } from "@/features/assignment/types";
import type { DeurExpectationSource, DeurShiftWindowDefinition, DeurShiftWindowSource, RentalRecord } from "@/features/rental/types";
import type { DeurRecord } from "../types";
import { resolveEffectiveDeurRevision } from "../services/correction/resolveEffectiveDeurRevision";
import { generateRentalDeurExpectations } from "../expectation/generateRentalDeurExpectations";
import { matchDeursToExpectations, type RentalDeurExpectationResult } from "../expectation/matchDeursToExpectations";
import type { RentalEquipmentLine } from "../../equipment-line";

export type RentalDeurComplianceStatus = "COMPLIANT" | "MISSING_DEUR" | "PENDING_CORRECTION" | "DEUR_INCOMPLETE";
export interface RentalDeurComplianceIssue { code: string; message: string }
export interface RentalDeurComplianceResult {
  rentalId: string;
  assignmentId?: string;
  required: boolean;
  status: RentalDeurComplianceStatus;
  reason: string;
  source: DeurExpectationSource;
  shiftWindowSource?: DeurShiftWindowSource;
  shiftWindowCapturedAt?: string;
  expectedCount: number;
  compliantCount: number;
  missingCount: number;
  incompleteCount: number;
  pendingCorrectionCount: number;
  expectations: RentalDeurExpectationResult[];
  counts: { total: number; effective: number; incomplete: number; pendingCorrections: number; superseded: number };
  issues: RentalDeurComplianceIssue[];
}
export interface EvaluateRentalDeurComplianceInput { rental: RentalRecord; assignment?: AssignmentRecord; deurs: DeurRecord[]; evaluationTimestamp?: string; liveShiftWindows?: DeurShiftWindowDefinition[] }

export function evaluateRentalEquipmentLineDeurCompliance(input: EvaluateRentalDeurComplianceInput & { lines: RentalEquipmentLine[] }) {
  return input.lines.filter((line) => line.rentalId === input.rental.id).map((line) => {
    const result = evaluateRentalDeurCompliance({
      ...input,
      rental: { ...input.rental, equipmentId: line.equipmentId, assignmentId: line.assignmentId, operatorId: line.operatorId },
      assignment: undefined,
      deurs: input.deurs.filter((record) => record.rentalEquipmentLineId ? record.rentalEquipmentLineId === line.id : record.equipmentId === line.equipmentId),
    });
    return {
      rentalEquipmentLineId: line.id,
      equipmentId: line.equipmentId,
      result: { ...result, expectations: result.expectations.map((expectation) => ({ ...expectation, expectationId: `${line.id}:${expectation.expectationId}` })) },
    };
  });
}

export function aggregateRentalEquipmentLineDeurCompliance(
  rentalId: string,
  lineResults: ReturnType<typeof evaluateRentalEquipmentLineDeurCompliance>,
): RentalDeurComplianceResult {
  if (lineResults.length === 0) return { rentalId, required: false, status: "COMPLIANT", reason: "The rental has no equipment-line DEUR expectations.", source: "LEGACY_RENTAL_FALLBACK", expectedCount: 0, compliantCount: 0, missingCount: 0, incompleteCount: 0, pendingCorrectionCount: 0, expectations: [], counts: { total: 0, effective: 0, incomplete: 0, pendingCorrections: 0, superseded: 0 }, issues: [] };
  const results = lineResults.map((item) => item.result);
  const status = results.some((item) => item.status === "PENDING_CORRECTION") ? "PENDING_CORRECTION"
    : results.some((item) => item.status === "MISSING_DEUR") ? "MISSING_DEUR"
    : results.some((item) => item.status === "DEUR_INCOMPLETE") ? "DEUR_INCOMPLETE"
    : "COMPLIANT";
  const sum = (read: (result: RentalDeurComplianceResult) => number) => results.reduce((total, result) => total + read(result), 0);
  return {
    rentalId, required: results.some((item) => item.required), status,
    reason: status === "COMPLIANT" ? "All equipment-line DEUR expectations are satisfied." : status === "PENDING_CORRECTION" ? "One or more equipment lines have a pending correction." : status === "MISSING_DEUR" ? "One or more equipment lines are missing a required DEUR." : "One or more equipment lines have an incomplete customer review.",
    source: results[0].source,
    expectedCount: sum((item) => item.expectedCount), compliantCount: sum((item) => item.compliantCount),
    missingCount: sum((item) => item.missingCount), incompleteCount: sum((item) => item.incompleteCount),
    pendingCorrectionCount: sum((item) => item.pendingCorrectionCount), expectations: results.flatMap((item) => item.expectations),
    counts: {
      total: sum((item) => item.counts.total), effective: sum((item) => item.compliantCount),
      incomplete: sum((item) => item.counts.incomplete), pendingCorrections: sum((item) => item.counts.pendingCorrections),
      superseded: sum((item) => item.counts.superseded),
    },
    issues: results.flatMap((item) => item.issues),
  };
}

const requiringStatuses = new Set<RentalRecord["status"]>(["Released", "Active", "Returned", "Closed"]);
const incompleteStatuses = new Set<DeurRecord["status"]>(["Draft", "In Progress", "Submitted", "Pending Acknowledgement"]);

function groupRevisionChains(records: DeurRecord[]) {
  const chains = new Map<string, DeurRecord[]>();
  records.forEach((record) => {
    const chainId = record.revision?.chainId ?? record.id;
    chains.set(chainId, [...(chains.get(chainId) ?? []), record]);
  });
  return [...chains.values()];
}

/** Read-only operational compliance. It deliberately does not inspect billing calculations or infer dates. */
export function evaluateRentalDeurCompliance({ rental, assignment, deurs, evaluationTimestamp, liveShiftWindows }: EvaluateRentalDeurComplianceInput): RentalDeurComplianceResult {
  const records = structuredClone(deurs.filter((record) => record.rentalId === rental.id));
  const required = requiringStatuses.has(rental.status);
  let effective = 0, pendingCorrections = 0, superseded = 0;
  const issues: RentalDeurComplianceIssue[] = [];

  groupRevisionChains(records).forEach((chain) => {
    const resolution = resolveEffectiveDeurRevision(chain);
    superseded += resolution.superseded.length;
    if (!resolution.valid) {
      issues.push(...resolution.issues.map((issue) => ({ code: issue.code, message: issue.message })));
      return;
    }
    if (resolution.currentEffective?.status === "Acknowledged") effective += 1;
    if (resolution.pendingCorrection) pendingCorrections += 1;
  });

  const incomplete = records.filter((record) => incompleteStatuses.has(record.status) && !record.revision?.previousRevisionId).length;
  const counts = { total: records.length, effective, incomplete, pendingCorrections, superseded };
  const legacyBase = { source: "LEGACY_RENTAL_FALLBACK" as const, expectedCount: required ? 1 : 0, compliantCount: effective > 0 ? 1 : 0, missingCount: 0, incompleteCount: incomplete > 0 ? 1 : 0, pendingCorrectionCount: pendingCorrections, expectations: [] as RentalDeurExpectationResult[] };
  const base = { rentalId: rental.id, ...(assignment?.id ? { assignmentId: assignment.id } : {}), required, counts, issues, ...legacyBase };

  if (rental.deurExpectationPolicy || rental.deurExpectationPolicyRequired) {
    const generated = generateRentalDeurExpectations({ rental, evaluationTimestamp: evaluationTimestamp ?? "", liveShiftWindows });
    const matched = matchDeursToExpectations({ expectations: generated.expectations, deurs: records });
    const explicitIssues = [...generated.issues, ...matched.issues];
    const expectedCount = matched.results.length;
    const compliantCount = matched.results.filter((item) => item.status === "COMPLIANT").length;
    const missingCount = matched.results.filter((item) => item.status === "MISSING").length;
    const incompleteCount = matched.results.filter((item) => item.status === "INCOMPLETE").length;
    const pendingCorrectionCount = matched.results.filter((item) => item.status === "PENDING_CORRECTION").length;
    const explicitBase = {
      rentalId: rental.id, ...(assignment?.id ? { assignmentId: assignment.id } : {}), required,
      source: generated.source, expectedCount, compliantCount, missingCount, incompleteCount, pendingCorrectionCount,
      ...(generated.shiftWindowSource ? { shiftWindowSource: generated.shiftWindowSource } : {}),
      ...(generated.shiftWindowCapturedAt ? { shiftWindowCapturedAt: generated.shiftWindowCapturedAt } : {}),
      expectations: matched.results, issues: explicitIssues,
      counts: { ...counts, effective: compliantCount, incomplete: incompleteCount, pendingCorrections: pendingCorrectionCount },
    };
    if (explicitIssues.some((issue) => !["LEGACY_DEUR_EXPECTATION_FALLBACK_USED", "LEGACY_SHIFT_WINDOW_FALLBACK_USED"].includes(issue.code))) return { ...explicitBase, status: "MISSING_DEUR", reason: explicitIssues[0].message };
    if (rental.deurExpectationPolicy?.frequency === "ON_DEMAND") {
      if (!required) return { ...explicitBase, status: "COMPLIANT", reason: "The rental lifecycle does not currently require a DEUR." };
      if (pendingCorrections > 0) return { ...explicitBase, pendingCorrectionCount: pendingCorrections, status: "PENDING_CORRECTION", reason: "A correction revision is awaiting resolution." };
      if (effective > 0) return { ...explicitBase, compliantCount: 1, status: "COMPLIANT", reason: "An effective acknowledged DEUR exists for this on-demand rental." };
      if (incomplete > 0) return { ...explicitBase, incompleteCount: 1, status: "DEUR_INCOMPLETE", reason: "A DEUR exists but has not been acknowledged." };
      return { ...explicitBase, missingCount: 1, status: "MISSING_DEUR", reason: "No effective acknowledged DEUR exists for this on-demand rental." };
    }
    if (pendingCorrectionCount > 0) return { ...explicitBase, status: "PENDING_CORRECTION", reason: "A required expectation has a pending correction." };
    if (missingCount > 0) return { ...explicitBase, status: "MISSING_DEUR", reason: "One or more required DEUR expectations are missing." };
    if (incompleteCount > 0) return { ...explicitBase, status: "DEUR_INCOMPLETE", reason: "One or more required DEUR expectations are incomplete." };
    return { ...explicitBase, status: "COMPLIANT", reason: expectedCount ? "All due DEUR expectations are satisfied." : "No date-based DEUR expectation is due." };
  }

  if (!required) return { ...base, status: "COMPLIANT", reason: "The rental lifecycle does not currently require a DEUR." };
  if (pendingCorrections > 0) return { ...base, status: "PENDING_CORRECTION", reason: "A correction revision is awaiting resolution." };
  if (effective > 0) return { ...base, status: "COMPLIANT", reason: "An effective acknowledged DEUR exists." };
  if (incomplete > 0 || records.some((record) => incompleteStatuses.has(record.status))) {
    return { ...base, status: "DEUR_INCOMPLETE", reason: "A DEUR exists but has not been acknowledged." };
  }
  return { ...base, missingCount: 1, status: "MISSING_DEUR", reason: issues.length ? "No valid effective acknowledged DEUR exists." : "No effective acknowledged DEUR exists." };
}
