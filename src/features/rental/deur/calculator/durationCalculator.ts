import type {
  DeurActivityLog,
  DeurRecord,
} from "../types";

interface Totals {
  operation: number;
  idle: number;
  mealBreak: number;
  correctiveMaintenance: number;
  preventiveMaintenance: number;
  demobilization: number;
}

function calculateTotals(
  logs: DeurActivityLog[]
): Totals {
  const totals: Totals = {
    operation: 0,
    idle: 0,
    mealBreak: 0,
    correctiveMaintenance: 0,
    preventiveMaintenance: 0,
    demobilization: 0,
  };

  logs.forEach((log) => {
    switch (log.activity) {
      case "Arrived at Site":
        // Arrival marks the beginning of the DEUR.
        // It does not contribute to billable duration.
        break;

      case "Operation":
        totals.operation +=
          log.durationMinutes;
        break;

      case "Idle":
        totals.idle +=
          log.durationMinutes;
        break;

      case "Meal Break":
        totals.mealBreak +=
          log.durationMinutes;
        break;

      case "Corrective Maintenance":
        totals.correctiveMaintenance +=
          log.durationMinutes;
        break;

      case "Preventive Maintenance":
        totals.preventiveMaintenance +=
          log.durationMinutes;
        break;

      case "Demobilization":
        totals.demobilization +=
          log.durationMinutes;
        break;
    }
  });

  return totals;
}

export function updateDeurTotals(
  record: DeurRecord
): DeurRecord {
  const totals =
    calculateTotals(record.logs);

  return {
    ...record,

    totalOperatingMinutes:
      totals.operation,

    totalIdleMinutes:
      totals.idle,

    totalMaintenanceMinutes:
      totals.correctiveMaintenance +
      totals.preventiveMaintenance,

    totalMealBreakMinutes:
      totals.mealBreak,

    /**
     * Administrative field.
     * Computed from dispatch records,
     * not operator activity.
     */
    totalMobilizationMinutes:
      record.totalMobilizationMinutes,

    totalDemobilizationMinutes:
      totals.demobilization,

    updatedAt:
      new Date().toISOString(),
  };
}