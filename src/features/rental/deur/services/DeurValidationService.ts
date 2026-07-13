import type {
    RentalRecord,
  } from "@/features/rental/types";
  
  export function canStartDeur(
    rental: RentalRecord
  ) {
    return (
      rental.status ===
      "Released"
    );
  }
  
  export function canCompleteDeur(
    rental: RentalRecord
  ) {
    return (
      rental.status ===
      "Released"
    );
  }
  
  export function canAcknowledgeDeur(
    rental: RentalRecord
  ) {
    return (
      rental.status ===
      "Released"
    );
  }