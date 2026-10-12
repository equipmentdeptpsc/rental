export const ASSIGNMENT_BUSINESS_TIMEZONE = "Asia/Manila";

export function assignmentBusinessDate(now = new Date()): string {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", {
    timeZone: ASSIGNMENT_BUSINESS_TIMEZONE, year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(now).filter((part) => part.type !== "literal").map((part) => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function isDateOnly(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`))
    && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
}

export function assignmentDateError(input: { assignedDate: string; expectedReturn?: string; originalAssignedDate?: string }, today = assignmentBusinessDate()): string | undefined {
  if (!isDateOnly(input.assignedDate)) return "Enter a valid Assigned / Start Date.";
  if (input.assignedDate !== input.originalAssignedDate && input.assignedDate < today) {
    return "Assigned / Start Date cannot be earlier than today (Philippine time).";
  }
  if (input.expectedReturn && (!isDateOnly(input.expectedReturn) || input.expectedReturn < input.assignedDate)) {
    return "Expected Return must be on or after the Assigned / Start Date.";
  }
  return undefined;
}
