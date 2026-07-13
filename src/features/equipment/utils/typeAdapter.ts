import type { EquipmentRecord } from "../types";

export function getEquipmentTypeName(
  equipment: EquipmentRecord
): string {

  return (
    equipment.type ??
    "Unspecified"
  );

}

export function getEquipmentTypeId(
  equipment: EquipmentRecord
): string {

  return (
    equipment.typeId ??
    ""
  );

}