import type { EquipmentRecord } from "../types";
import type { RentalRecord } from "@/features/rental/types";

export function getFleetAnalytics(
  equipment: EquipmentRecord[],
  rentals: RentalRecord[]
) {
  const activeEquipment = equipment.filter(
    (e) => !e.deleted
  );

  const available = activeEquipment.filter(
    (e) => e.status === "Available"
  ).length;

  const assigned = activeEquipment.filter(
    (e) => e.status === "Assigned"
  ).length;

  const maintenance = activeEquipment.filter(
    (e) => e.status === "Maintenance"
  ).length;

  const activeRentals = rentals.filter(
    (r) => r.status === "Active"
  ).length;

  const overdueRentals = rentals.filter(
    (r) =>
      r.status === "Active" &&
      Boolean(r.expectedReturn) &&
      new Date(r.expectedReturn!) < new Date()
  ).length;

  const utilization =
    activeEquipment.length === 0
      ? 0
      : Math.round(
          (assigned / activeEquipment.length) * 100
        );

  const availability =
    activeEquipment.length === 0
      ? 0
      : Math.round(
          (available / activeEquipment.length) * 100
        );

  return {
    totalEquipment: activeEquipment.length,
    available,
    assigned,
    maintenance,
    activeRentals,
    overdueRentals,
    utilization,
    availability,
  };
}
