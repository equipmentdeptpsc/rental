import type { EquipmentRecord } from "../data/equipment.mock";

// ===============================
// SIMULATED API DELAY (SAFE MVP)
// ===============================
function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// NOTE:
// This is NOT a real store.
// It is just a future API simulation layer.

export async function createEquipment(
  item: EquipmentRecord
): Promise<EquipmentRecord> {
  await delay(150);
  return item;
}

export async function updateEquipment(
  item: EquipmentRecord
): Promise<EquipmentRecord> {
  await delay(150);
  return item;
}

export async function deleteEquipment(
  id: string
): Promise<string> {
  await delay(150);
  return id;
}