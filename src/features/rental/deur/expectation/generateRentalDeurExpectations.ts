import type { DeurExpectationShiftCode, DeurExpectationSource, DeurShiftWindowDefinition, DeurShiftWindowSource, RentalRecord } from "@/features/rental/types";
import { addCalendarDays, calendarDateAt } from "./dateRules";
import { normalizeRentalDeurExpectationPolicy } from "./normalizeRentalDeurExpectationPolicy";
import { normalizeDeurShiftWindow } from "../shift-window/normalizeDeurShiftWindow";
import { resolveDeurShiftWindowBoundary } from "../shift-window/resolveDeurShiftWindowBoundary";

export type DeurExpectationPeriodStatus = "DUE" | "CURRENT" | "NOT_YET_DUE";
export interface DeurExpectation { expectationId: string; rentalId: string; workDate: string; shiftCode?: DeurExpectationShiftCode; status: DeurExpectationPeriodStatus; source: DeurExpectationSource; windowLabel?: string; startTime?: string; endTime?: string; crossesMidnight?: boolean }
export interface GenerateRentalDeurExpectationsResult { source: DeurExpectationSource; shiftWindowSource?: DeurShiftWindowSource; shiftWindowCapturedAt?: string; policy?: RentalRecord["deurExpectationPolicy"]; expectations: DeurExpectation[]; issues: Array<{ code: string; message: string }> }
const operational = new Set<RentalRecord["status"]>(["Released", "Active", "Returned", "Closed"]);
export const createDeurExpectationId = ({ rentalId, workDate, shiftCode }: { rentalId: string; workDate: string; shiftCode?: string }) => [rentalId, workDate, shiftCode].filter(Boolean).join(":");

export function generateRentalDeurExpectations({ rental, evaluationTimestamp, liveShiftWindows = [] }: { rental: RentalRecord; evaluationTimestamp: string; liveShiftWindows?: DeurShiftWindowDefinition[] }): GenerateRentalDeurExpectationsResult {
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
  let windows: DeurShiftWindowDefinition[] = [], shiftWindowSource: DeurShiftWindowSource | undefined;
  if (policy.frequency === "PER_SHIFT") {
    const snapshots = rental.deurShiftWindowSnapshots ?? [];
    if ((policy.expectedShiftCodes ?? []).every((code) => snapshots.some((window) => window.code === code))) { windows = snapshots; shiftWindowSource = "IMMUTABLE_RENTAL_SNAPSHOT"; }
    else if (!rental.deurExpectationPolicyRequired && (policy.expectedShiftCodes ?? []).every((code) => liveShiftWindows.some((window) => window.code === code))) { windows = liveShiftWindows; shiftWindowSource = "LEGACY_LIVE_WINDOW_FALLBACK"; }
    else return { source: "EXPLICIT_POLICY", policy, expectations: [], issues: [{ code: "SHIFT_WINDOW_NOT_CONFIGURED", message: "Immutable shift windows are not configured for this Rental." }] };
    for (const code of policy.expectedShiftCodes ?? []) {
      const matches = windows.filter((item) => item.code === code), valid = matches.length === 1 ? normalizeDeurShiftWindow(matches[0]) : undefined;
      if (!valid?.valid) return { source: "EXPLICIT_POLICY", shiftWindowSource, policy, expectations: [], issues: [{ code: "SHIFT_WINDOW_NOT_CONFIGURED", message: `A valid ${code} shift window is required.` }] };
    }
  }
  for (let workDate = start; workDate <= end; workDate = addCalendarDays(workDate, 1)) {
    if (excluded.has(workDate)) continue;
    const dateStatus: DeurExpectationPeriodStatus = workDate === evaluationDate && ["Released", "Active"].includes(rental.status) ? "CURRENT" : "DUE";
    const shiftCodes = policy.frequency === "PER_SHIFT" ? policy.expectedShiftCodes! : [undefined];
    shiftCodes.forEach((shiftCode) => {
      const window = shiftCode ? windows.find((item) => item.code === shiftCode) : undefined;
      const boundary = window && workDate === evaluationDate ? resolveDeurShiftWindowBoundary({ workDate, window, evaluationTimestamp }) : undefined;
      const status = boundary?.valid ? boundary.value.state : dateStatus;
      expectations.push({ expectationId: createDeurExpectationId({ rentalId: rental.id, workDate, shiftCode }), rentalId: rental.id, workDate, ...(shiftCode ? { shiftCode } : {}), status, source: "EXPLICIT_POLICY", ...(window ? { windowLabel: window.label, startTime: window.startTime, endTime: window.endTime, crossesMidnight: window.endTime <= window.startTime } : {}) });
    });
  }
  return { source: "EXPLICIT_POLICY", shiftWindowSource, shiftWindowCapturedAt: rental.deurShiftWindowSnapshots?.[0]?.capturedAt, policy, expectations: structuredClone(expectations), issues: shiftWindowSource === "LEGACY_LIVE_WINDOW_FALLBACK" ? [{ code: "LEGACY_SHIFT_WINDOW_FALLBACK_USED", message: "Legacy live shift windows are being used for monitoring." }] : [] };
}
