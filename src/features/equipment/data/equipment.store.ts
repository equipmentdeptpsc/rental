import type { EquipmentRecord } from "./equipment.mock";
import { equipmentData } from "./equipment.mock";

let equipmentStore: EquipmentRecord[] = [...equipmentData];

export function getEquipment() {
  return equipmentStore;
}

export function addEquipment(equipment: EquipmentRecord) {
  equipmentStore.push(equipment);
}

export function updateEquipment(updated: EquipmentRecord) {
  equipmentStore = equipmentStore.map((item) =>
    item.id === updated.id ? updated : item
  );
}

export function deleteEquipment(id: string) {
  equipmentStore = equipmentStore.filter(
    (item) => item.id !== id
  );
}