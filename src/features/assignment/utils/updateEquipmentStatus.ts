import type { EquipmentRecord } from "@/features/equipment/types";

export function markEquipmentAssigned(
  equipment: EquipmentRecord
): EquipmentRecord {
  return {
    ...equipment,
    status: "Assigned",
  };
}

export function markEquipmentAvailable(
  equipment: EquipmentRecord
): EquipmentRecord {
  return {
    ...equipment,
    status: "Available",
  };
}