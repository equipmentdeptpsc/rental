import type {
  RentalLifecycleStatus,
  RentalRecord,
} from "../types";
import { isRentalBillingMethod, isRentalType } from "../types";

export function getRentalCommercialTermsError(
  rental: { rentalType?: unknown; billingMethod?: unknown }
): string | undefined {
  if (!isRentalType(rental.rentalType)) {
    return "Select a rental type before creating a rental.";
  }

  if (!isRentalBillingMethod(rental.billingMethod)) {
    return "Select a billing method before creating a rental.";
  }

  return undefined;
}

const allowedTransitions: Record<
  RentalLifecycleStatus,
  RentalLifecycleStatus[]
> = {
  Draft: ["Assigned", "Cancelled"],
  Assigned: ["Reserved", "Cancelled"],
  Reserved: ["Released", "Cancelled"],
  Released: ["Active"],
  Active: ["Returned"],
  Returned: ["Closed"],
  Closed: [],
  Cancelled: [],
};

const equipmentBlockingStatuses: RentalLifecycleStatus[] = [
  "Draft",
  "Assigned",
  "Reserved",
  "Released",
  "Active",
];

/** A rental in one of these states exclusively occupies its equipment. */
export function isEquipmentBlockingRental(rental: Pick<RentalRecord, "status">): boolean {
  return equipmentBlockingStatuses.includes(rental.status);
}

export function findEquipmentBlockingRental(
  rentals: RentalRecord[],
  equipmentId: string,
  excludeRentalId?: string,
): RentalRecord | undefined {
  return rentals.find((rental) =>
    rental.id !== excludeRentalId &&
    rental.equipmentId === equipmentId &&
    isEquipmentBlockingRental(rental)
  );
}

export function canTransitionRental(
  rental: { status: RentalLifecycleStatus },
  nextStatus: RentalLifecycleStatus
): boolean {
  return allowedTransitions[rental.status]
    .includes(nextStatus);
}

export function getRentalTransitionError(
  rental: { status: RentalLifecycleStatus },
  nextStatus: RentalLifecycleStatus
): string | undefined {
  if (canTransitionRental(rental, nextStatus)) {
    return undefined;
  }

  if (rental.status === "Closed") {
    return "Closed rentals are read-only.";
  }

  if (rental.status === "Cancelled") {
    return "Cancelled rentals cannot be changed.";
  }

  return `Rental cannot transition from ${rental.status} to ${nextStatus}.`;
}

export function isRentalLocked(rental: RentalRecord) {
  return rental.status === "Closed";
}

export function canEditRental(rental: RentalRecord) {
  return !isRentalLocked(rental);
}
