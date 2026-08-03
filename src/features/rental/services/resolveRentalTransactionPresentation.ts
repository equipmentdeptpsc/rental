import type { EquipmentRecord } from "@/features/equipment/types";
import type { Operator } from "@/features/operators/types";
import type { RentalEquipmentLine } from "../equipment-line";
import type { RentalRecord } from "../types";

export function resolveRentalTransactionPresentation(input: { rental: RentalRecord; lines: readonly RentalEquipmentLine[]; equipment: readonly EquipmentRecord[]; operators: readonly Operator[] }) {
  const lines = input.lines.filter((line) => line.rentalId === input.rental.id && line.status !== "Cancelled");
  const equipmentLabels = lines.map((line) => { const record = input.equipment.find((item) => item.id === line.equipmentId); return record ? `${record.assetNo} - ${record.equipmentName}` : `Equipment ${line.equipmentId}`; });
  const operatorLabels = lines.map((line) => input.operators.find((item) => item.id === line.operatorId)?.name ?? `Operator ${line.operatorId}`);
  return { equipmentLabel: equipmentLabels.length ? equipmentLabels.join("; ") : "Unknown equipment", operatorLabel: operatorLabels.length ? operatorLabels.join("; ") : "Not assigned", rentalEquipmentLineIds: lines.map((line) => line.id) };
}
