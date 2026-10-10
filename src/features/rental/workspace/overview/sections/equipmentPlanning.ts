import type { RentalRecord } from "@/features/rental/types";
import { localCalendarDate } from "@/features/rental/utils/rentalDateValidation";
import type { EquipmentAvailabilityState } from "@/features/equipment/availability/controller";

/** Start with the current business day when it falls inside the Rental schedule. */
export function initialEquipmentStartDate(
  rental: Pick<RentalRecord, "dateOut" | "expectedReturn">,
  today = localCalendarDate(),
): string {
  const scheduled = today > rental.dateOut ? today : rental.dateOut;
  return rental.expectedReturn && scheduled > rental.expectedReturn ? rental.expectedReturn : scheduled;
}

export function equipmentStartError(
  rental: Pick<RentalRecord, "dateOut" | "expectedReturn">,
  start: string,
): string | undefined {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start)) return "Enter an effective start date.";
  if (start < rental.dateOut) return "Effective start cannot precede the Rental start.";
  if (rental.expectedReturn && start > rental.expectedReturn) return "Effective start cannot follow the expected return.";
  return undefined;
}

export function availabilityLabel(state: EquipmentAvailabilityState | undefined): string {
  if (!state || state.status === "not_checked" || state.status === "checking") return "Checking availability";
  if (state.status === "available") return "Available";
  if (state.status === "error") return "Availability unknown";
  const source = state.result?.conflicts[0]?.sourceType;
  return source === "ASSIGNMENT" ? "Assigned" : source === "RENTAL" ? "Reserved / conflicting" : "Restricted / conflicting";
}
