import type {
    RentalRecord,
  } from "../types";
  
  export interface CloseResult {
  
    rental: RentalRecord;
  
  }
  
  export function closeRental(
  
    rental: RentalRecord
  
  ): CloseResult {
  
    return {
  
      rental: {
  
        ...rental,
  
        status: "Closed",
  
      },
  
    };
  
  }
  
  export function canCloseRental(

    rental: RentalRecord
  
  ) {
  
    if (
  
      rental.status ===
  
      "Closed"
  
    ) {
  
      return false;
  
    }
  
    return (
  
      rental.status ===
  
      "Returned"
  
    );
  
  }