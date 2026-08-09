import type {
    RentalRecord,
  } from "@/features/rental/types";
  
export function canStartDeur(
    rental: Pick<RentalRecord, "status">
  ) {
    return rental.status === "Active";
  }

  export function getDeurStartEligibility(
    rental: Pick<RentalRecord, "status">
  ): { eligible: true } | { eligible: false; message: string } {
    if (canStartDeur(rental)) return { eligible: true };
    if (rental.status === "Returned") return {
      eligible: false,
      message: "This rental has already been returned but may be missing required DEUR evidence. Normal DEUR creation is locked. Ask Rental Operations to correct or reopen the rental through an approved recovery process before recording the missing DEUR.",
    };
    return {
      eligible: false,
      message: `Rental must be Active before creating or starting a DEUR. Current status: ${rental.status}.`,
    };
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
