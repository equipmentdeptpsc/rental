import type { DeurExpectationShiftCode, RentalDeurExpectationPolicy } from "@/features/rental/types";
import { isCalendarDate, isValidTimezone } from "./dateRules";

export type DeurExpectationPolicyIssueCode = "DEUR_EXPECTATION_FREQUENCY_UNSUPPORTED" | "DEUR_EXPECTATION_START_INVALID" | "DEUR_EXPECTATION_END_INVALID" | "DEUR_EXPECTATION_SHIFT_REQUIRED" | "DEUR_EXPECTATION_DUPLICATE_SHIFT" | "DEUR_EXPECTATION_POLICY_INVALID";
export type NormalizePolicyResult = { valid: true; value: RentalDeurExpectationPolicy } | { valid: false; code: DeurExpectationPolicyIssueCode; message: string };
const frequencies = new Set(["PER_WORKDAY", "PER_SHIFT", "ON_DEMAND"]);
const shifts = new Set<DeurExpectationShiftCode>(["DAY", "NIGHT"]);

export function normalizeRentalDeurExpectationPolicy(input: unknown): NormalizePolicyResult {
  if (!input || typeof input !== "object") return { valid: false, code: "DEUR_EXPECTATION_POLICY_INVALID", message: "DEUR expectation policy is invalid." };
  const item = input as Record<string, unknown>, frequency = item.frequency;
  if (typeof frequency !== "string" || !frequencies.has(frequency)) return { valid: false, code: "DEUR_EXPECTATION_FREQUENCY_UNSUPPORTED", message: "DEUR expectation frequency is unsupported." };
  if (!isCalendarDate(item.effectiveFrom)) return { valid: false, code: "DEUR_EXPECTATION_START_INVALID", message: "Expectation effective-from date is invalid." };
  if (item.effectiveUntil !== undefined && (!isCalendarDate(item.effectiveUntil) || item.effectiveUntil < item.effectiveFrom)) return { valid: false, code: "DEUR_EXPECTATION_END_INVALID", message: "Expectation effective-until date is invalid." };
  const capturedAt = typeof item.capturedAt === "string" ? item.capturedAt : "";
  if (!Number.isFinite(Date.parse(capturedAt)) || (item.timezone !== undefined && (typeof item.timezone !== "string" || !isValidTimezone(item.timezone)))) return { valid: false, code: "DEUR_EXPECTATION_POLICY_INVALID", message: "Expectation capture timestamp or timezone is invalid." };
  const rawShifts = item.expectedShiftCodes;
  if (rawShifts !== undefined && (!Array.isArray(rawShifts) || rawShifts.some((shift) => typeof shift !== "string" || !shifts.has(shift as DeurExpectationShiftCode)))) return { valid: false, code: "DEUR_EXPECTATION_POLICY_INVALID", message: "Expected shifts are invalid." };
  if (frequency === "PER_SHIFT" && (!rawShifts || rawShifts.length === 0)) return { valid: false, code: "DEUR_EXPECTATION_SHIFT_REQUIRED", message: "At least one expected shift is required." };
  if (rawShifts && new Set(rawShifts).size !== rawShifts.length) return { valid: false, code: "DEUR_EXPECTATION_DUPLICATE_SHIFT", message: "Expected shifts cannot be duplicated." };
  const rawExcluded = item.excludeDates;
  if (rawExcluded !== undefined && (!Array.isArray(rawExcluded) || rawExcluded.some((date) => !isCalendarDate(date)))) return { valid: false, code: "DEUR_EXPECTATION_POLICY_INVALID", message: "Excluded expectation date is invalid." };
  const value: RentalDeurExpectationPolicy = {
    frequency: frequency as RentalDeurExpectationPolicy["frequency"], effectiveFrom: item.effectiveFrom,
    ...(typeof item.effectiveUntil === "string" ? { effectiveUntil: item.effectiveUntil } : {}),
    ...(rawShifts?.length ? { expectedShiftCodes: [...rawShifts] as DeurExpectationShiftCode[] } : {}),
    ...(rawExcluded ? { excludeDates: [...new Set(rawExcluded as string[])].sort() } : {}),
    ...(typeof item.timezone === "string" && item.timezone ? { timezone: item.timezone } : {}),
    capturedAt: new Date(capturedAt).toISOString(),
  };
  return { valid: true, value };
}
