import type { CanonicalBookingListItem } from "./canonical";

export type BookingDatePreset = "today" | "week" | "next7" | "month" | "custom";
export type BookingAttention = "release" | "return";

export const businessDate = (date = new Date()) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

export const shiftBookingDate = (date: string, days: number) => {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
};

export function bookingDateRange(preset: BookingDatePreset, today: string, customFrom?: string, customTo?: string) {
  if (preset === "today") return { from: today, to: today };
  if (preset === "next7") return { from: today, to: shiftBookingDate(today, 6) };
  if (preset === "month") {
    const first = `${today.slice(0, 7)}-01`;
    return { from: first, to: shiftBookingDate(`${today.slice(0, 7)}-01`, new Date(Number(today.slice(0, 4)), Number(today.slice(5, 7)), 0).getDate() - 1) };
  }
  if (preset === "custom") return { from: customFrom ?? "", to: customTo ?? "" };
  const weekday = new Date(`${today}T00:00:00.000Z`).getUTCDay();
  const from = shiftBookingDate(today, -((weekday + 6) % 7));
  return { from, to: shiftBookingDate(from, 6) };
}

export function bookingRangeError(from: string, to: string): string | undefined {
  const valid = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00.000Z`)) && new Date(`${value}T00:00:00.000Z`).toISOString().slice(0, 10) === value;
  if (!valid(from) || !valid(to) || from > to) return "Choose a valid From and To date.";
  if ((Date.parse(`${to}T00:00:00.000Z`) - Date.parse(`${from}T00:00:00.000Z`)) / 86_400_000 >= 93) return "Choose a range of 93 days or less.";
  return undefined;
}

export function bookingOverlapsRange(row: CanonicalBookingListItem, from: string, to: string): boolean {
  const end = row.actualReturn ?? row.expectedReturn;
  return row.dateOut.slice(0, 10) <= to && (!end || end.slice(0, 10) >= from);
}

export function bookingMatchesKeyword(row: CanonicalBookingListItem, query: string): boolean {
  const normalized = query.trim().toLocaleLowerCase();
  return !normalized || [row.rentalNumber, row.equipmentAssetNumber, row.equipmentName, row.customerName, row.projectName].some((field) => field?.toLocaleLowerCase().includes(normalized));
}

export function bookingAttentionLabels(row: CanonicalBookingListItem, today: string): string[] {
  const labels: string[] = [];
  const start = row.dateOut.slice(0, 10);
  const end = row.expectedReturn?.slice(0, 10);
  if (row.rentalStatus === "Reserved") labels.push(start === today ? "Release scheduled today" : "Reserved, awaiting release");
  if (["Released", "Active"].includes(row.rentalStatus) && !row.actualReturn && end) {
    if (end < today) labels.push("Return overdue");
    else if (end === today) labels.push("Return due today");
  }
  return labels;
}
