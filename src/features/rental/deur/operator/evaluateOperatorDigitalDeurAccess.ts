import type { AssignmentRecord } from "@/features/assignment/types";
import type { Operator } from "@/features/operators/types";
import type { RentalRecord } from "@/features/rental/types";
import type { DeurRecord } from "../types";
import { resolveActiveOperatorDeur } from "./resolveActiveOperatorDeur";
import type { DeurOperatorAction, OperatorDigitalDeurAccessIssue, OperatorDigitalDeurAccessResult } from "./types";
import { deriveDeurEventState } from "../services/deriveDeurEventState";
import { calendarDateAt } from "../expectation/dateRules";

const issue = (code: string, message: string): OperatorDigitalDeurAccessIssue => ({ code, message });
export function evaluateOperatorDigitalDeurAccess(input: { actor?: { id?: string; name?: string; role?: string }; operator?: Operator; assignment?: AssignmentRecord; rental?: RentalRecord; deurs: DeurRecord[]; evaluationTimestamp: string; shift?: DeurRecord["shift"] }): OperatorDigitalDeurAccessResult {
  const { actor, operator, assignment, rental, deurs, shift } = input;
  const base = { allowed: false, allowedActions: [] as DeurOperatorAction[], issues: [] as OperatorDigitalDeurAccessIssue[] };
  if (!operator) return { ...base, issues: [issue("OPERATOR_NOT_FOUND", "Operator was not found.")] };
  if (!assignment) return { ...base, issues: [issue("ASSIGNMENT_NOT_FOUND", "Assignment was not found.")] };
  if (!rental) return { ...base, issues: [issue("RENTAL_NOT_FOUND", "Rental was not found.")] };
  const identityMatches = actor?.role === "Operator" && (actor.id === operator.id || actor.name?.trim().toLocaleLowerCase() === operator.name.trim().toLocaleLowerCase());
  if (!identityMatches) return { ...base, issues: [issue("DEUR_ACCESS_NOT_AUTHORIZED", "The signed-in Operator is not assigned to this Rental.")] };
  if (rental.operatorId !== operator.id) return { ...base, issues: [issue("RENTAL_OPERATOR_MISMATCH", "Operator does not belong to this Rental.")] };
  if (rental.assignmentId !== assignment.id || rental.equipmentId !== assignment.equipmentId) return { ...base, issues: [issue("RENTAL_ASSIGNMENT_MISMATCH", "Rental relationships do not match the Assignment.")] };
  if (!["Released", "Active"].includes(rental.status)) return { ...base, issues: [issue("RENTAL_NOT_OPERATIONAL", "Rental must be Released or Active.")] };
  if (!rental.operationalMetadata?.costCode || !rental.operationalMetadata.activityCode) return { ...base, issues: [issue("OPERATIONAL_SNAPSHOT_REQUIRED", "Rental operational metadata snapshot is required.")] };
  if (rental.commercialSnapshotRequired && !rental.commercialSnapshot) return { ...base, issues: [issue("COMMERCIAL_SNAPSHOT_REQUIRED", "Rental commercial snapshot is required.")] };
  if (rental.deurExpectationPolicyRequired && !rental.deurExpectationPolicy) return { ...base, issues: [issue("DEUR_EXPECTATION_POLICY_REQUIRED", "Rental expectation policy is required.")] };
  if (rental.deurExpectationPolicy?.frequency === "PER_SHIFT") {
    const code = shift === "Day" ? "DAY" : shift === "Night" ? "NIGHT" : undefined;
    if (!code || !rental.deurExpectationPolicy.expectedShiftCodes?.includes(code) || !rental.deurShiftWindowSnapshots?.some((window) => window.code === code)) return { ...base, issues: [issue("SHIFT_NOT_ALLOWED", "Selected shift is not configured for this Rental.")] };
  }
  const active = resolveActiveOperatorDeur({ rentalId: rental.id, operatorId: operator.id, deurs });
  if (active.status === "AMBIGUOUS") return { ...base, issues: [active.issue] };
  const evaluationWorkDate = calendarDateAt(input.evaluationTimestamp, rental.deurExpectationPolicy?.timezone);
  const related = deurs.filter((record) => record.rentalId === rental.id && record.operatorId === operator.id && (!evaluationWorkDate || record.workDate === evaluationWorkDate) && (!shift || record.shift === shift));
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
      allowedActions.push("END_SHIFT");
    }
  }
  return { allowed: true, rentalId: rental.id, assignmentId: assignment.id, operatorId: operator.id, ...(active.status === "RESOLVED" ? { activeDeurId: active.record.id } : {}), allowedActions, issues: [] };
}
