import type { EquipmentRecord } from "../types";

import type { AssignmentRecord } from "@/features/assignment/types";
import type { RentalRecord } from "@/features/rental/types";
import type { MaintenanceRecord } from "@/features/maintenance/types";
import type { DailyLogRecord } from "@/features/daily-log/types";

export interface EquipmentProfile {
  equipment: EquipmentRecord;

  currentAssignment?: AssignmentRecord;

  activeRental?: RentalRecord;

  maintenanceHistory: MaintenanceRecord[];

  dailyLogs: DailyLogRecord[];

  assignments: AssignmentRecord[];

  rentals: RentalRecord[];

  totalUsage: number;

  maintenanceCount: number;

  rentalCount: number;
}

export function buildEquipmentProfile(
  equipment: EquipmentRecord,

  assignments: AssignmentRecord[],

  rentals: RentalRecord[],

  maintenance: MaintenanceRecord[],

  dailyLogs: DailyLogRecord[]
): EquipmentProfile {

  const equipmentAssignments =
    assignments.filter(
      (a) =>
        a.equipmentId ===
        equipment.id
    );

  const equipmentRentals =
    rentals.filter(
      (r) =>
        r.equipmentId ===
        equipment.id
    );

  const equipmentMaintenance =
    maintenance.filter(
      (m) =>
        m.equipmentId ===
        equipment.id
    );

  const equipmentLogs =
    dailyLogs.filter(
      (l) =>
        l.equipmentId ===
        equipment.id
    );

  return {

    equipment,

    currentAssignment:
      equipmentAssignments.find(
        (a) =>
          a.status ===
          "Active"
      ),

    activeRental:
      equipmentRentals.find(
        (r) =>
          r.status ===
          "Active"
      ),

    maintenanceHistory:
      equipmentMaintenance,

    dailyLogs:
      equipmentLogs,

    assignments:
      equipmentAssignments,

    rentals:
      equipmentRentals,

    totalUsage:
      equipmentLogs.reduce(
        (sum, log) =>
          sum +
          log.workingHours,
        0
      ),

    maintenanceCount:
      equipmentMaintenance.length,

    rentalCount:
      equipmentRentals.length,
  };
}