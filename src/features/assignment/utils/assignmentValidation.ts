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
          "This equipment is already assigned.",
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