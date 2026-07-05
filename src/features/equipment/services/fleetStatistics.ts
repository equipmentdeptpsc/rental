import type { EquipmentRecord } from "../types";

export interface FleetStatistics {
  total: number;

  available: number;

  assigned: number;

  maintenance: number;

  utilization: number;
}

export function calculateFleetStatistics(
  equipment: EquipmentRecord[]
): FleetStatistics {
  const total =
    equipment.length;

  const available =
    equipment.filter(
      (e) =>
        e.status ===
        "Available"
    ).length;

  const assigned =
    equipment.filter(
      (e) =>
        e.status ===
        "Assigned"
    ).length;

  const maintenance =
    equipment.filter(
      (e) =>
        e.status ===
        "Maintenance"
    ).length;

  return {
    total,

    available,

    assigned,

    maintenance,

    utilization:
      total === 0
        ? 0
        : Math.round(
            (assigned /
              total) *
              100
          ),
  };
}