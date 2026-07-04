import type { EquipmentRecord } from "../types";

export function findEquipment(
  equipment: EquipmentRecord[],
  id: string
): EquipmentRecord | undefined {
  return equipment.find(
    (item) => item.id === id
  );
}