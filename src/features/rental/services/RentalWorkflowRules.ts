import type {
    RentalRecord,
  } from "../types";
  
  export function isRentalLocked(
    rental: RentalRecord
  ) {
    return (
      rental.status ===
      "Closed"
    );
  }
  
  export function canEditRental(
    rental: RentalRecord
  ) {
    return !isRentalLocked(
      rental
    );
  }