import type { EquipmentRecord } from "@/features/equipment/types";

export interface RentalValidationResult {
  valid: boolean;
  message?: string;
}

export function validateRental(
  equipment: EquipmentRecord | undefined
): RentalValidationResult {
  if (!equipment) {
    return {
      valid: false,
      message: "Equipment not found.",
    };
  }

  if (equipment.deleted) {
    return {
      valid: false,
      message: "Equipment has been deleted.",
    };
  }

  switch (equipment.status) {
    case "Assigned":
      return {
        valid: false,
        message: "Equipment is currently assigned.",
      };
  
    case "Maintenance":
      return {
        valid: false,
        message: "Equipment is under maintenance.",
      };
  
    default:
      return {
        valid: true,
      };
  }
}