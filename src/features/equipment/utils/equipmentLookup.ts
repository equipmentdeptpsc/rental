import type { EquipmentRecord } from "../types";

export function findEquipmentById(
  equipment: EquipmentRecord[],
  id: string
) {
  return equipment.find(
    (item) => item.id === id
  );
}

export function findEquipmentByAssetNo(
  equipment: EquipmentRecord[],
  assetNo: string
) {
  return equipment.find(
    (item) =>
      item.assetNo === assetNo
  );
}

export function getEquipmentName(
  equipment: EquipmentRecord[],
  id: string
) {
  return (
    equipment.find(
      (item) => item.id === id
    )?.equipmentName ?? "-"
  );
}