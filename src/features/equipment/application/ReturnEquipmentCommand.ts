import type { EquipmentRecord } from "../types";

import type {
  EquipmentOperationResult,
} from "./types";

export function returnEquipment(
  equipment: EquipmentRecord
): EquipmentOperationResult {
  return {
    equipment: {
      ...equipment,
      projectId: "",
      operatorId: "",
      status: "Available",
    },
  };
}