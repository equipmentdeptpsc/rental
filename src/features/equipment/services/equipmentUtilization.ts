import type { EquipmentRecord } from "@/features/equipment/types";
import type { AssignmentRecord } from "@/features/assignment/types";
import type { RentalRecord } from "@/features/rental/types";

export interface EquipmentUtilization {

  equipmentId: string;

  assetNo: string;

  equipmentName: string;

  status: string;

  assignments: number;

  rentals: number;

  reading: number;

  utilization: number;

}

export function buildEquipmentUtilization(
  equipment: EquipmentRecord[],
  assignments: AssignmentRecord[],
  rentals: RentalRecord[]
): EquipmentUtilization[] {

  return equipment.map(machine => {

    const assignmentCount =
      assignments.filter(
        a => a.equipmentId === machine.id
      ).length;

    const rentalCount =
      rentals.filter(
        r => r.equipmentId === machine.id
      ).length;

    return {

      equipmentId: machine.id,

      assetNo: machine.assetNo,

      equipmentName: machine.equipmentName,

      status: machine.status,

      assignments: assignmentCount,

      rentals: rentalCount,

      reading: machine.currentReading,

      utilization:
        assignmentCount + rentalCount,

    };

  });

}