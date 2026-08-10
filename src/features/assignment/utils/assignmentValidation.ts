import type { EquipmentRecord } from "@/features/equipment/types";

export interface AssignmentValidationResult {
  valid: boolean;
  message: string;
}

export function validateEquipmentAssignment(
  equipment: EquipmentRecord | undefined
): AssignmentValidationResult {
  if (!equipment) {
    return {
      valid: false,
      message: "Equipment not found.",
    };
  }

  if (equipment.deleted || equipment.active === false) {
    return {
      valid: false,
      message: "Equipment is not available for assignment.",
    };
  }

  switch (equipment.status) {
    case "Available":
      return {
        valid: true,
        message: "",
      };

    case "Assigned":
      return {
        valid: false,
        message:
          "This equipment is already booked by an active assignment.",
      };

    case "Rented":
      return {
        valid: false,
        message: "This equipment is currently deployed on a Rental.",
      };

    case "Maintenance":
      return {
        valid: false,
        message:
          "Equipment is currently under maintenance.",
      };

    default:
      return {
        valid: false,
        message:
          "Equipment cannot be assigned.",
      };
  }
}
