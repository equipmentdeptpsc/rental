import type { RentalRecord } from "@/features/rental/types";
import type { EquipmentRecord } from "@/features/equipment/types";

import {
  returnEquipment,
} from "@/features/equipment/application";

export interface CloseRentalResult {
  rental: RentalRecord;

  equipment: EquipmentRecord;
}

export function closeRental(
  rental: RentalRecord,
  equipment: EquipmentRecord
): CloseRentalResult {
  const {
    equipment: availableEquipment,
  } = returnEquipment(
    equipment
  );

  return {
    rental: {
      ...rental,

      actualReturn:
        new Date()
          .toISOString()
          .split("T")[0],

      status:
        "Returned",
    },

    equipment:
      availableEquipment,
  };
}