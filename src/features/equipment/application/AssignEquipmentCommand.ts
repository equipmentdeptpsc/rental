import type { EquipmentRecord } from "../types";

import type {
  EquipmentOperationResult,
} from "./types";

export function assignEquipment(
  equipment: EquipmentRecord,
  projectId: string,
  operatorId: string
): EquipmentOperationResult {
  return {
    equipment: {
      ...equipment,
      projectId,
      operatorId,
      status: "Assigned",
    },
  };
}