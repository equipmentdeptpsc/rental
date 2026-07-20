import type { DeurShiftWindowDefinition } from "@/features/rental/types";

export type NormalizeDeurShiftWindowResult =
  | { valid: true; value: DeurShiftWindowDefinition }
  | { valid: false; code: string; message: string };

const hhmm = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
const validTimezone = (timezone: string) => {
  try { new Intl.DateTimeFormat("en-US", { timeZone: timezone }).format(0); return true; } catch { return false; }
};

export function normalizeDeurShiftWindow(value: unknown): NormalizeDeurShiftWindowResult {
  if (!value || typeof value !== "object") return { valid: false, code: "SHIFT_WINDOW_CODE_INVALID", message: "Shift window is invalid." };
  const candidate = value as Record<string, unknown>;
  const code = typeof candidate.code === "string" ? candidate.code.trim().toUpperCase() : "";
  const label = typeof candidate.label === "string" ? candidate.label.trim() : "";
  const startTime = typeof candidate.startTime === "string" ? candidate.startTime.trim() : "";
  const endTime = typeof candidate.endTime === "string" ? candidate.endTime.trim() : "";
  const timezone = typeof candidate.timezone === "string" ? candidate.timezone.trim() : "";
  if (code !== "DAY" && code !== "NIGHT") return { valid: false, code: "SHIFT_WINDOW_CODE_INVALID", message: "Shift code must be DAY or NIGHT." };
  if (!label) return { valid: false, code: "SHIFT_WINDOW_LABEL_REQUIRED", message: "Shift label is required." };
  if (!hhmm.test(startTime)) return { valid: false, code: "SHIFT_WINDOW_START_INVALID", message: "Start time must use HH:mm." };
  if (!hhmm.test(endTime)) return { valid: false, code: "SHIFT_WINDOW_END_INVALID", message: "End time must use HH:mm." };
  if (startTime === endTime) return { valid: false, code: "SHIFT_WINDOW_ZERO_DURATION", message: "Start and end time must differ." };
  if (!timezone || !validTimezone(timezone)) return { valid: false, code: "SHIFT_WINDOW_TIMEZONE_INVALID", message: "Select a valid timezone." };
  const capturedAt = typeof candidate.capturedAt === "string" && Number.isFinite(Date.parse(candidate.capturedAt)) ? new Date(candidate.capturedAt).toISOString() : undefined;
  return { valid: true, value: { code, label, startTime, endTime, timezone, ...(capturedAt ? { capturedAt } : {}) } };
}
