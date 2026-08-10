import type { EquipmentRecord } from "../types";

const labels: Readonly<Record<EquipmentRecord["status"], string>> = {
  Available: "Available",
  Assigned: "Booked",
  Rented: "Deployed",
  Maintenance: "Maintenance",
};

export function presentEquipmentStatus(status: EquipmentRecord["status"]): string {
  return labels[status];
}
