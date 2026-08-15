import type { EquipmentRecord } from "@/features/equipment/types";

export interface FleetUtilizationSummary {
  total: number;
  available: number;
  assigned: number;
  deployed: number;
  maintenance: number;
  utilized: number;
  rate: number;
}

export function calculateFleetUtilization(equipment: readonly EquipmentRecord[]): FleetUtilizationSummary {
  const eligible = equipment.filter((item) => item.active !== false && !item.deleted);
  const available = eligible.filter((item) => item.status === "Available").length;
  const assigned = eligible.filter((item) => item.status === "Assigned").length;
  const deployed = eligible.filter((item) => item.status === "Rented").length;
  const maintenance = eligible.filter((item) => item.status === "Maintenance").length;
  const utilized = assigned + deployed;
  return {
    total: eligible.length,
    available,
    assigned,
    deployed,
    maintenance,
    utilized,
    rate: eligible.length === 0 ? 0 : Math.round((utilized / eligible.length) * 100),
  };
}
