import type { RentalRecord } from "../types";
import type { EquipmentRecord } from "@/features/equipment/types";

export interface ReturnResult {

  rental: RentalRecord;

  equipment: EquipmentRecord;

}

export function canReturnRental(

    rental: RentalRecord
  
  ) {
  
    return (
  
      rental.status !==
  
      "Returned"
  
    );
  
  }

  export function canReturnEquipment(

    equipment: EquipmentRecord
  
  ) {
  
    return (
  
      equipment.status ===
  
      "Rented"
  
    );
  
  }

export function returnRental(

  rental: RentalRecord,

  equipment: EquipmentRecord

): ReturnResult {

  return {

    rental: {

      ...rental,

      status: "Returned",

      actualReturn:

        new Date()

          .toISOString()

          .split("T")[0],

    },

    equipment: {

      ...equipment,

      status: "Available",

      projectId: "",

      operatorId: "",

    },

  };

}