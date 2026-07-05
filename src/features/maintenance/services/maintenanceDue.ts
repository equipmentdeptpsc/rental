import type { EquipmentRecord } from "@/features/equipment/types";
import type { MaintenanceRecord } from "../types";

export interface MaintenanceDueEquipment {
  equipment: EquipmentRecord;
  due: boolean;
  remaining: number;
}

const DEFAULT_INTERVAL = 250;

export function getMaintenanceDueEquipment(
  equipment: EquipmentRecord[],
  maintenance: MaintenanceRecord[]
): MaintenanceDueEquipment[] {
  return equipment.map((machine) => {
    const history = maintenance
      .filter(
        (m) =>
          m.equipmentId === machine.id &&
          m.status === "Completed"
      )
      .sort(
        (a, b) =>
          b.currentReading -
          a.currentReading
      );

    const lastReading =
      history.length > 0
        ? history[0].currentReading
        : 0;

    const nextDue =
      lastReading +
      DEFAULT_INTERVAL;

    const remaining =
      nextDue -
      machine.currentReading;

    return {
      equipment: machine,
      due:
        machine.currentReading >=
        nextDue,
      remaining,
    };
  });
}