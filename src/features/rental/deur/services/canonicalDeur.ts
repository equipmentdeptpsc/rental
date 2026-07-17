import type { DeurRecord, DeurTotals } from "../types";

const NUMBER_PATTERN = /^DEUR-(\d{6})$/i;
export const emptyDeurTotals = (): DeurTotals => ({ shiftMinutes: 0, operationMinutes: 0, idleMinutes: 0, mealBreakMinutes: 0 });

export function generateDeurNumber(records: DeurRecord[]) {
  const highest = records.reduce((max, record) => {
    const match = NUMBER_PATTERN.exec(record.deurNumber ?? "");
    return match ? Math.max(max, Number(match[1])) : max;
  }, 0);
  return `DEUR-${String(highest + 1).padStart(6, "0")}`;
}

export function normalizeDeur(record: DeurRecord): DeurRecord {
  const events = Array.isArray(record.events) ? record.events : [];
  return {
    ...record,
    reportDate: record.reportDate ?? record.workDate,
    events,
    totals: record.totals ?? {
      shiftMinutes: 0,
      operationMinutes: Math.round(record.totalOperatingMinutes ?? 0),
      idleMinutes: Math.round(record.totalIdleMinutes ?? 0),
      mealBreakMinutes: Math.round(record.totalMealBreakMinutes ?? 0),
    },
    legacy: record.legacy ?? events.length === 0,
  };
}

export function isCanonicalBillingEligible(record: DeurRecord) {
  return !record.legacy && record.status === "Acknowledged" && !record.billingLocked;
}
