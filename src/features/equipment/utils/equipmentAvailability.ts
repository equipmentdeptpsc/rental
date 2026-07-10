import type { EquipmentRecord } from "../types";

export function isEquipmentAvailable(
  equipment: EquipmentRecord | undefined
): boolean {
  return equipment?.status === "Available";
}

export function canBeAssigned(
  equipment: EquipmentRecord | undefined
): boolean {
  return isEquipmentAvailable(equipment);
}

export function canBeRented(
  equipment: EquipmentRecord | undefined
): boolean {
  return isEquipmentAvailable(equipment);
}

export function getAvailabilityMessage(
  equipment: EquipmentRecord | undefined
): string {
  if (!equipment)
    return "Equipment not found.";

  switch (equipment.status) {
    case "Available":
      return "";

    case "Assigned":
      return "Equipment is already assigned.";

    case "Maintenance":
      return "Equipment is currently under maintenance.";

    default:
      return "Equipment is unavailable.";
  }
}