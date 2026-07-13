import type {
    EquipmentRecord,
  } from "@/features/equipment/types";
  
  import type {
    RentalRecord,
  } from "../types";
  
  export interface ReleaseResult {
  
    equipment: EquipmentRecord;
  
    rental: RentalRecord;
  
  }
  
  export function releaseRental(
  
    rental: RentalRecord,
  
    equipment: EquipmentRecord
  
  ): ReleaseResult {
  
    return {
  
      rental: {
  
        ...rental,
  
        status: "Released",
  
      },
  
      equipment: {
  
        ...equipment,
  
        status: "Rented",
  
      },
  
    };
  
  }