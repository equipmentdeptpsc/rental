import type { DeurExpectationShiftCode, DeurExpectationSource, DeurShiftWindowDefinition, DeurShiftWindowSource, RentalRecord } from "@/features/rental/types";
import { addCalendarDays, calendarDateAt } from "./dateRules";
import { normalizeRentalDeurExpectationPolicy } from "./normalizeRentalDeurExpectationPolicy";

export type DeurExpectationPeriodStatus = "DUE" | "CURRENT" | "NOT_YET_DUE";
export interface DeurExpectation { expectationId: string; rentalId: string; rentalEquipmentLineId?: string; equipmentId?: string; operatorId?: string; expectationFingerprint?:string; workDate: string; shiftCode?: DeurExpectationShiftCode; status: DeurExpectationPeriodStatus; source: DeurExpectationSource; windowLabel?: string; startTime?: string; endTime?: string; crossesMidnight?: boolean }
export interface GenerateRentalDeurExpectationsResult { source: DeurExpectationSource; shiftWindowSource?: DeurShiftWindowSource; shiftWindowCapturedAt?: string; policy?: RentalRecord["deurExpectationPolicy"]; expectations: DeurExpectation[]; issues: Array<{ code: string; message: string }> }
const operational = new Set<RentalRecord["status"]>(["Released", "Active", "Returned", "Closed"]);
export const createDeurExpectationId = ({ rentalId, workDate }: { rentalId: string; workDate: string; shiftCode?: string }) => [rentalId, workDate].join(":");

export function generateRentalDeurExpectations({ rental, evaluationTimestamp }: { rental: RentalRecord; evaluationTimestamp: string; liveShiftWindows?: DeurShiftWindowDefinition[] }): GenerateRentalDeurExpectationsResult {
  const explicit = rental.deurExpectationPolicy;
  if (!explicit) return {
    source: "LEGACY_RENTAL_FALLBACK", expectations: [], issues: rental.deurExpectationPolicyRequired
      ? [{ code: "DEUR_EXPECTATION_POLICY_REQUIRED", message: "An explicit DEUR expectation policy is required." }]
      : [{ code: "LEGACY_DEUR_EXPECTATION_FALLBACK_USED", message: "Legacy rental-level DEUR monitoring is in use." }],
  };
  const normalized = normalizeRentalDeurExpectationPolicy(explicit);
  if (!normalized.valid) return { source: "EXPLICIT_POLICY", expectations: [], issues: [{ code: normalized.code, message: normalized.message }] };
  const policy = normalized.value, timezone = policy.timezone;
  if (!operational.has(rental.status) || rental.status === "Cancelled" || policy.frequency === "ON_DEMAND") return { source: "EXPLICIT_POLICY", policy, expectations: [], issues: [] };
  const evaluationDate = calendarDateAt(evaluationTimestamp, timezone);
  const releaseDate = rental.releasedAt ? calendarDateAt(rental.releasedAt, timezone) : undefined;
  if (!evaluationDate) return { source: "EXPLICIT_POLICY", policy, expectations: [], issues: [{ code: "DEUR_EXPECTATION_POLICY_INVALID", message: "Evaluation timestamp is invalid." }] };
  const start = [policy.effectiveFrom, releaseDate].filter(Boolean).sort().at(-1)!;
  const actualEnd = [rental.returnedAt ? calendarDateAt(rental.returnedAt, timezone) : undefined, rental.closedAt ? calendarDateAt(rental.closedAt, timezone) : undefined].filter(Boolean).sort()[0];
  const end = [evaluationDate, policy.effectiveUntil, actualEnd].filter(Boolean).sort()[0]!;
  if (start > end) return { source: "EXPLICIT_POLICY", policy, expectations: [], issues: [] };
  const excluded = new Set(policy.excludeDates ?? []), expectations: DeurExpectation[] = [];
  for (let workDate = start; workDate <= end; workDate = addCalendarDays(workDate, 1)) {
    if (excluded.has(workDate)) continue;
    const dateStatus: DeurExpectationPeriodStatus = workDate === evaluationDate && ["Released", "Active"].includes(rental.status) ? "CURRENT" : "DUE";
    expectations.push({ expectationId: createDeurExpectationId({ rentalId: rental.id, workDate }), rentalId: rental.id, workDate, status: dateStatus, source: "EXPLICIT_POLICY" });
  }
  return { source: "EXPLICIT_POLICY", policy, expectations: structuredClone(expectations), issues: [] };
}
