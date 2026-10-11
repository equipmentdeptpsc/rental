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
  filters?: { equipmentId?: string; operatorId?: string; customerId?: string; projectId?: string; status?: string; dateFrom?: string; dateTo?: string };
}): RentalRecord[] {
  const normalized = input.query.trim().toLowerCase();
  if (!normalized && !Object.values(input.filters ?? {}).some(Boolean)) return input.rentals;
  return input.rentals.filter((rental) => {
    const filters = input.filters ?? {};
    const lines = input.lines.filter((line) => line.rentalId === rental.id);
    if (filters.status && rental.status !== filters.status) return false;
    if (filters.customerId && rental.customerId !== filters.customerId) return false;
    if (filters.projectId && rental.projectId !== filters.projectId) return false;
    if (filters.equipmentId && rental.equipmentId !== filters.equipmentId && !lines.some((line) => line.equipmentId === filters.equipmentId)) return false;
    if (filters.operatorId && rental.operatorId !== filters.operatorId && !lines.some((line) => line.operatorId === filters.operatorId)) return false;
    if (filters.dateFrom && (rental.actualReturn ?? rental.expectedReturn ?? rental.dateOut).slice(0, 10) < filters.dateFrom) return false;
    if (filters.dateTo && rental.dateOut.slice(0, 10) > filters.dateTo) return false;
    if (!normalized) return true;
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
