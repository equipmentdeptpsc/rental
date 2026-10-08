export type DashboardPeriodPreset = "this-month" | "last-month" | "this-quarter" | "last-quarter" | "this-year" | "custom";
export type DashboardComparison = "previous" | "last-year";
export interface DashboardDateRange { from: string; to: string }

const day = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
const parse = (value: string) => new Date(`${value}T12:00:00Z`);
const addDays = (value: string, days: number) => { const date = parse(value); date.setUTCDate(date.getUTCDate() + days); return date.toISOString().slice(0, 10); };
export const rangeDays = (range: DashboardDateRange) => Math.round((parse(range.to).getTime() - parse(range.from).getTime()) / 86_400_000) + 1;
export const withinRange = (date: string | undefined, range: DashboardDateRange) => Boolean(date && date.slice(0, 10) >= range.from && date.slice(0, 10) <= range.to);

export function dashboardPeriod(preset: DashboardPeriodPreset, now = new Date(), custom?: DashboardDateRange): DashboardDateRange {
  const year = now.getFullYear(), month = now.getMonth(), today = day(now);
  if (preset === "custom") return custom ?? { from: today, to: today };
  if (preset === "this-month") return { from: day(new Date(year, month, 1)), to: today };
  if (preset === "last-month") return { from: day(new Date(year, month - 1, 1)), to: day(new Date(year, month, 0)) };
  const quarterStart = Math.floor(month / 3) * 3;
  if (preset === "this-quarter") return { from: day(new Date(year, quarterStart, 1)), to: today };
  if (preset === "last-quarter") return { from: day(new Date(year, quarterStart - 3, 1)), to: day(new Date(year, quarterStart, 0)) };
  return { from: day(new Date(year, 0, 1)), to: today };
}

export function comparisonPeriod(range: DashboardDateRange, mode: DashboardComparison): DashboardDateRange {
  if (mode === "previous") return { from: addDays(range.from, -rangeDays(range)), to: addDays(range.from, -1) };
  const lastYear = (value: string) => { const date = parse(value); const year = date.getUTCFullYear() - 1, month = date.getUTCMonth(), dayOfMonth = Math.min(date.getUTCDate(), new Date(Date.UTC(year, month + 1, 0)).getUTCDate()); return new Date(Date.UTC(year, month, dayOfMonth)).toISOString().slice(0, 10); };
  return { from: lastYear(range.from), to: lastYear(range.to) };
}

export function comparePeriodValues(current: number, previous: number) {
  if (previous === 0) return { percent: null, label: current > 0 ? "New" : "No prior activity" };
  const percent = ((current - previous) / Math.abs(previous)) * 100;
  return { percent, label: `${percent >= 0 ? "▲" : "▼"} ${Math.abs(percent).toFixed(1)}%` };
}
