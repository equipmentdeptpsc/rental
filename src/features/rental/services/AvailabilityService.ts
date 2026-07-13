import type {
    EquipmentRecord,
  } from "@/features/equipment/types";
  
  import type {
    RentalRecord,
  } from "../types";
  
  export interface AvailabilityResult {
  
    success: boolean;
  
    message?: string;
  
  }
  
  export function canCreateRental(
    equipment: EquipmentRecord | undefined,
    rentals: RentalRecord[] = []
  ): AvailabilityResult {
  
    if (!equipment) {
  
      return {
        success: false,
        message: "Equipment not found.",
      };
  
    }
  
    if (equipment.deleted) {
  
      return {
        success: false,
        message: "Equipment has been deleted.",
      };
  
    }
  
    if (equipment.active === false) {
  
      return {
        success: false,
        message: "Equipment is inactive.",
      };
  
    }
  
    if (
      equipment.status !==
      "Available"
    ) {
  
      return {
        success: false,
        message:
          `Equipment is currently ${equipment.status}.`,
      };
  
    }
  
    const activeRental =
      rentals.find(
        rental =>
          rental.equipmentId ===
            equipment.id &&
          rental.status !==
            "Returned" &&
          rental.status !==
            "Closed"
      );
  
    if (activeRental) {
  
      return {
        success: false,
        message:
          "Equipment already has an active rental.",
      };
  
    }
  
    return {
      success: true,
    };
  
  }