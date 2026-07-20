import type { DeurShiftWindowDefinition } from "@/features/rental/types";
import { addCalendarDays, isCalendarDate } from "../expectation/dateRules";
import { normalizeDeurShiftWindow } from "./normalizeDeurShiftWindow";

export type DeurShiftWindowBoundaryState = "NOT_YET_DUE" | "CURRENT" | "DUE";
export interface DeurShiftWindowBoundary { shiftCode: "DAY" | "NIGHT"; workDate: string; startsAt: string; endsAt: string; crossesMidnight: boolean; state: DeurShiftWindowBoundaryState }

function wallClockToUtc(date: string, time: string, timezone: string): string | undefined {
  const [year, month, day] = date.split("-").map(Number), [hour, minute] = time.split(":").map(Number);
  const target = Date.UTC(year, month - 1, day, hour, minute); let guess = target;
  const formatter = new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const parts = Object.fromEntries(formatter.formatToParts(new Date(guess)).filter((part) => part.type !== "literal").map((part) => [part.type, Number(part.value)]));
    const represented = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute);
    if (represented === target) return new Date(guess).toISOString();
    guess += target - represented;
  }
  return undefined;
}

export function resolveDeurShiftWindowBoundary({ workDate, window, evaluationTimestamp }: { workDate: string; window: DeurShiftWindowDefinition; evaluationTimestamp: string }): { valid: true; value: DeurShiftWindowBoundary } | { valid: false; code: string; message: string } {
  if (!isCalendarDate(workDate)) return { valid: false, code: "SHIFT_WINDOW_WORK_DATE_INVALID", message: "Work date is invalid." };
  const normalized = normalizeDeurShiftWindow(window); if (!normalized.valid) return normalized;
  const evaluation = Date.parse(evaluationTimestamp); if (!Number.isFinite(evaluation)) return { valid: false, code: "SHIFT_WINDOW_EVALUATION_INVALID", message: "Evaluation timestamp is invalid." };
  const crossesMidnight = normalized.value.endTime <= normalized.value.startTime;
  const startsAt = wallClockToUtc(workDate, normalized.value.startTime, normalized.value.timezone);
  const endsAt = wallClockToUtc(crossesMidnight ? addCalendarDays(workDate, 1) : workDate, normalized.value.endTime, normalized.value.timezone);
  if (!startsAt || !endsAt) return { valid: false, code: "SHIFT_WINDOW_TIMEZONE_INVALID", message: "Shift boundary cannot be represented in this timezone." };
  const state = evaluation < Date.parse(startsAt) ? "NOT_YET_DUE" : evaluation < Date.parse(endsAt) ? "CURRENT" : "DUE";
  return { valid: true, value: { shiftCode: normalized.value.code, workDate, startsAt, endsAt, crossesMidnight, state } };
}
