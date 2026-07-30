import type { AssignmentRecord } from "@/features/assignment/types";
import type { Operator } from "@/features/operators/types";
import type { RentalRecord } from "@/features/rental/types";
import type { DeurRecord } from "../types";
import { resolveActiveOperatorDeur } from "./resolveActiveOperatorDeur";
import type { DeurOperatorAction, OperatorDigitalDeurAccessIssue, OperatorDigitalDeurAccessResult } from "./types";
import { deriveDeurEventState } from "../services/deriveDeurEventState";
import { calendarDateAt } from "../expectation/dateRules";
import type { RentalEquipmentLine } from "../../equipment-line";
import { resolveDeurRentalEquipmentLine } from "../services/resolveDeurRentalEquipmentLine";
import { getDeurStartEligibility } from "../services/DeurValidationService";

const issue = (code: string, message: string): OperatorDigitalDeurAccessIssue => ({ code, message });
export function evaluateOperatorDigitalDeurAccess(input: { actor?: { id?: string; name?: string; role?: string }; authenticatedOperatorId?: string; operator?: Operator; assignment?: AssignmentRecord; rental?: RentalRecord; rentalEquipmentLine?: RentalEquipmentLine; deurs: DeurRecord[]; evaluationTimestamp: string; shift?: DeurRecord["shift"] }): OperatorDigitalDeurAccessResult {
  const { actor, operator, assignment, rental, deurs, shift } = input;
  const base = { allowed: false, allowedActions: [] as DeurOperatorAction[], issues: [] as OperatorDigitalDeurAccessIssue[] };
  if (!operator) return { ...base, issues: [issue("OPERATOR_NOT_FOUND", "Operator was not found.")] };
  if (!rental) return { ...base, issues: [issue("RENTAL_NOT_FOUND", "Rental was not found.")] };
  const lifecycle = getDeurStartEligibility(rental);
  if (!lifecycle.eligible) return { ...base, issues: [issue("RENTAL_NOT_OPERATIONAL", lifecycle.message)] };
  const lineResolution = input.rentalEquipmentLine
    ? { success: true as const, line: input.rentalEquipmentLine }
    : resolveDeurRentalEquipmentLine({ rental, equipmentId: rental.equipmentId, assignmentId: rental.assignmentId, operatorId: rental.operatorId });
  if (!lineResolution.success) return { ...base, issues: [issue(lineResolution.issue.code === "DEUR_LINE_COMMERCIAL_SNAPSHOT_REQUIRED" ? "COMMERCIAL_SNAPSHOT_REQUIRED" : lineResolution.issue.code, lineResolution.issue.message)] };
  const line = lineResolution.line;
  if (line.assignmentId && !assignment) return { ...base, issues: [issue("ASSIGNMENT_NOT_FOUND", "Assignment was not found.")] };
  if(!actor||(!input.authenticatedOperatorId&&actor.role!=="Operator"))return{...base,issues:[issue("DEUR_ACCESS_NOT_AUTHORIZED","Your application user is not linked to an Operator record.")]};
  const identityMatches = input.authenticatedOperatorId
    ? input.authenticatedOperatorId === operator.id
    : actor.id === operator.id;
  if (!identityMatches) return { ...base, issues: [issue("DEUR_ACCESS_NOT_AUTHORIZED", "Your login is not linked to this Operator record.")] };
  if (line.operatorId !== operator.id) return { ...base, issues: [issue("RENTAL_OPERATOR_MISMATCH", "You are not assigned to this Rental Equipment Line.")] };
  if (line.assignmentId && (line.assignmentId !== assignment?.id || line.equipmentId !== assignment.equipmentId)) return { ...base, issues: [issue("RENTAL_ASSIGNMENT_MISMATCH", "Rental Equipment Line relationships do not match the Assignment.")] };
  if (!rental.operationalMetadata?.costCode || !rental.operationalMetadata.activityCode) return { ...base, issues: [issue("OPERATIONAL_SNAPSHOT_REQUIRED", "Rental operational metadata snapshot is required.")] };
  if (line.commercialSnapshotRequired && !line.commercialSnapshot) return { ...base, issues: [issue("COMMERCIAL_SNAPSHOT_REQUIRED", "Rental Equipment Line commercial snapshot is required.")] };
  if (rental.deurExpectationPolicyRequired && !rental.deurExpectationPolicy) return { ...base, issues: [issue("DEUR_EXPECTATION_POLICY_REQUIRED", "Rental expectation policy is required.")] };
  if (rental.deurExpectationPolicy?.frequency === "PER_SHIFT") {
    const code = shift === "Day" ? "DAY" : shift === "Night" ? "NIGHT" : undefined;
    if (!code || !rental.deurExpectationPolicy.expectedShiftCodes?.includes(code) || !rental.deurShiftWindowSnapshots?.some((window) => window.code === code)) return { ...base, issues: [issue("SHIFT_NOT_ALLOWED", "Selected shift is not configured for this Rental.")] };
  }
  const active = resolveActiveOperatorDeur({ rentalId: rental.id, rentalEquipmentLineId: line.id, equipmentId: line.equipmentId, operatorId: operator.id, deurs });
  if (active.status === "AMBIGUOUS") return { ...base, issues: [active.issue] };
  const evaluationWorkDate = calendarDateAt(input.evaluationTimestamp, rental.deurExpectationPolicy?.timezone);
  const related = deurs.filter((record) => record.rentalId === rental.id && (record.rentalEquipmentLineId ? record.rentalEquipmentLineId === line.id : record.equipmentId === line.equipmentId) && record.operatorId === operator.id && (!evaluationWorkDate || record.workDate === evaluationWorkDate) && (!shift || record.shift === shift));
  const blocked = related.find((record) => record.billingLocked || record.billId || record.billingStatementId || record.status === "Billed" || record.revision?.supersededByRevisionId || (record.revision?.previousRevisionId && ["Draft", "In Progress", "Submitted"].includes(record.status)));
  if (blocked) return { ...base, issues: [issue(blocked.revision?.supersededByRevisionId ? "DEUR_SUPERSEDED" : blocked.revision?.previousRevisionId ? "DEUR_CORRECTION_PENDING" : blocked.billingLocked || blocked.billId || blocked.billingStatementId || blocked.status === "Billed" ? "DEUR_CONSUMED" : "DEUR_LOCKED", "Digital DEUR is locked by its current lifecycle state.")] };
  const allowedActions: DeurOperatorAction[] = [];
  if (active.status === "RESOLVED") {
    const state = deriveDeurEventState(active.record);
    if (state.shiftNotStarted) allowedActions.push("START_OPERATION", "START_IDLE");
    else if (state.shiftOpen) {
      if (state.openPrimaryActivity !== "operation") allowedActions.push("RESUME_OPERATION");
      if (state.openPrimaryActivity !== "idle") allowedActions.push("START_IDLE");
      if (state.openPrimaryActivity !== "mealBreak") allowedActions.push("START_MEAL_BREAK");
      if (state.openPrimaryActivity !== "breakdown") allowedActions.push("START_BREAKDOWN");
      if(state.openPrimaryActivity)allowedActions.push("END_ACTIVITY");
      allowedActions.push("END_SHIFT");
    }
  }
  return { allowed: true, rentalId: rental.id, rentalEquipmentLineId: line.id, assignmentId: line.assignmentId, operatorId: operator.id, ...(active.status === "RESOLVED" ? { activeDeurId: active.record.id } : {}), allowedActions, issues: [] };
}
