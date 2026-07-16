import type { EquipmentRecord } from "../types";

export function generateAssetNumber(equipment: EquipmentRecord[]): string {
  const highest = equipment.reduce((current, item) => {
    const match = item.assetNo.match(/^(?:EQP-)?(\d+)$/i);
    return match ? Math.max(current, Number(match[1])) : current;
  }, 0);

  return `EQP-${String(highest + 1).padStart(6, "0")}`;
}
