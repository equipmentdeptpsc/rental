import type { EquipmentStatus } from "../types";

export function getEquipmentStatus(
  assigned: boolean,
  rented: boolean,
 maintenance: boolean
): EquipmentStatus {
  if (maintenance) {
    return "Maintenance";
  }

  if (rented || assigned) {
    return "Assigned";
  }

  return "Available";
}