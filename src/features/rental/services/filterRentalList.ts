import type { EquipmentRecord } from "@/features/equipment/types";
import type { Operator } from "@/features/operators/types";
import type { RentalEquipmentLine } from "@/features/rental/equipment-line/types";
import { resolveRentalTransactionPresentation } from "@/features/rental/services/resolveRentalTransactionPresentation";
import type { RentalRecord } from "@/features/rental/types";

export function filterRentalList(input: {
  rentals: RentalRecord[];
  lines: RentalEquipmentLine[];
  equipment: EquipmentRecord[];
  operators: Operator[];
  query: string;
}): RentalRecord[] {
  const normalized = input.query.trim().toLowerCase();
  if (!normalized) return input.rentals;
  return input.rentals.filter((rental) => {
    const presentation = resolveRentalTransactionPresentation({
      rental,
      lines: input.lines,
      equipment: input.equipment,
      operators: input.operators,
    });
    return `${rental.rentalNumber ?? ""} ${rental.customer} ${rental.project} ${presentation.equipmentLabel} ${presentation.operatorLabel}`
      .toLowerCase()
      .includes(normalized);
  });
}
