import type { EquipmentRecord } from "@/features/equipment/types";

export function releaseEquipment(
  equipment: EquipmentRecord
): EquipmentRecord {
  return {
    ...equipment,

    status: "Available",

    projectId: "",

    operatorId: "",
  };
}