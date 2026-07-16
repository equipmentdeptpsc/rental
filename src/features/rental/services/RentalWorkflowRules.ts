import type {
  RentalLifecycleStatus,
  RentalRecord,
} from "../types";

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
