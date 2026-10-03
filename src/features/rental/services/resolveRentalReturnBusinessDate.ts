import type { RentalRecord } from "@/features/rental/types";
import { calendarDateAt, isCalendarDate } from "@/features/rental/deur/expectation/dateRules";

const tenantDefaultTimezone = "Asia/Manila";

export interface RentalReturnBusinessDate {
  timezone: string;
  value: string;
  label: string;
}

/** Resolves the authoritative business date at the moment a Rental return is requested. */
export function resolveRentalReturnBusinessDate(rental: RentalRecord, now = new Date()): RentalReturnBusinessDate | undefined {
  const timezone = rental.deurExpectationPolicy?.timezone || tenantDefaultTimezone;
  const value = calendarDateAt(now.toISOString(), timezone);
  if (!value || !isCalendarDate(value) || value < rental.dateOut) return undefined;
  return {
    timezone,
    value,
    label: new Intl.DateTimeFormat("en-US", { timeZone: timezone, dateStyle: "long" }).format(now),
  };
}
