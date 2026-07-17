import { useMemo } from "react";

import { useEquipment } from "@/features/equipment/context/EquipmentContext";
import { useRental } from "@/features/rental/context/RentalContext";

export function useDashboard() {
  const { equipment } = useEquipment();
  const { rentals } = useRental();

  return useMemo(() => {
    const totalEquipment = equipment.length;

    const availableEquipment =
      equipment.filter(
        (e) => e.status === "Available"
      ).length;

    const assignedEquipment =
      equipment.filter(
        (e) => e.status === "Assigned"
      ).length;

    const maintenanceEquipment =
      equipment.filter(
        (e) => e.status === "Maintenance"
      ).length;

    const activeRentals =
      rentals.filter(
        (r) => r.status === "Active"
      ).length;

    const overdueRentals =
      rentals.filter((r) => {
        if (r.status !== "Active" || !r.expectedReturn) return false;

        return (
          new Date(r.expectedReturn) <
          new Date()
        );
      }).length;

    return {
      totalEquipment,
      availableEquipment,
      assignedEquipment,
      maintenanceEquipment,
      activeRentals,
      overdueRentals,
    };
  }, [equipment, rentals]);
}
