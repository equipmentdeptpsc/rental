import type {
  RentalLifecycleStatus,
  RentalRecord,
} from "../types";

const allowedTransitions: Record<
  RentalLifecycleStatus,
  RentalLifecycleStatus[]
> = {
  Draft: ["Confirmed", "Cancelled"],
  Confirmed: ["Released", "Cancelled"],
  Released: ["Active"],
  Active: ["Returned"],
  Returned: ["Closed"],
  Closed: [],
  Cancelled: [],
};

export function normalizeRentalStatus(
  status: RentalRecord["status"]
): RentalLifecycleStatus | undefined {
  if (status === "Reserved") {
    return "Draft";
  }

  return status in allowedTransitions
    ? status
    : undefined;
}

export function canTransitionRental(
  rental: RentalRecord,
  nextStatus: RentalLifecycleStatus
): boolean {
  const currentStatus = normalizeRentalStatus(rental.status);

  return currentStatus !== undefined &&
    allowedTransitions[currentStatus].includes(nextStatus);
}

export function getRentalTransitionError(
  rental: RentalRecord,
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
