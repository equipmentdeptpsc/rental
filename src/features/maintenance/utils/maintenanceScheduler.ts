import type { EquipmentRecord } from "@/features/equipment/types";

export function requiresMaintenance(
  equipment: EquipmentRecord
) {
  if (
    equipment.maintenanceType ===
    "Engine Hours"
  ) {
    return (
      equipment.currentReading >= 5000
    );
  }

  return (
    equipment.currentReading >= 10000
  );
}