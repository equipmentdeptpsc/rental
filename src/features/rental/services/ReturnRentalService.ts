import type { EquipmentRecord } from "@/features/equipment/types";

import type { RentalRecord } from "../types";

export interface ReturnResult {
  rental: RentalRecord;
  equipment: EquipmentRecord;
}

export function canReturnRental(rental: RentalRecord): boolean {
  return (
    rental.status === "Released" ||
    rental.status === "Active"
  );
}

export function canReturnEquipment(equipment: EquipmentRecord): boolean {
  return equipment.status === "Rented";
}

export function returnRental(
  rental: RentalRecord,
  equipment: EquipmentRecord
): ReturnResult {
  return {
    rental: {
      ...rental,
      status: "Returned",
      actualReturn: new Date().toISOString().split("T")[0],
    },
    equipment: {
      ...equipment,
      status: "Available",
      projectId: "",
      operatorId: "",
    },
  };
}
