import type { EquipmentRecord } from "@/features/equipment/types";
import type { AssignmentRecord } from "@/features/assignment/types";
import type { RentalRecord } from "@/features/rental/types";
import type { MaintenanceRecord } from "@/features/maintenance/types";

import type { DashboardSummary } from "../types";

function isWithinNext7Days(date: string) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const target = new Date(date);
  target.setHours(0, 0, 0, 0);

  const diff =
    target.getTime() - today.getTime();

  const days =
    diff / (1000 * 60 * 60 * 24);

  return days >= 0 && days <= 7;
}

export function calculateDashboardSummary(
  equipment: EquipmentRecord[],
  assignments: AssignmentRecord[],
  rentals: RentalRecord[],
  maintenance: MaintenanceRecord[]
): DashboardSummary {
  const today = new Date();

  const activeRentals =
    rentals.filter(
      (r) => r.status === "Active"
    );

  return {
    totalEquipment:
      equipment.length,

    availableEquipment:
      equipment.filter(
        (e) =>
          e.status === "Available"
      ).length,

    assignedEquipment:
      equipment.filter(
        (e) =>
          e.status === "Assigned"
      ).length,

    maintenanceEquipment:
      equipment.filter(
        (e) =>
          e.status === "Maintenance"
      ).length,

    activeAssignments:
      assignments.filter(
        (a) =>
          a.status === "Active"
      ).length,

    completedAssignments:
      assignments.filter(
        (a) =>
          a.status === "Completed"
      ).length,

    activeRentals:
      activeRentals.length,

    returnedRentals:
      rentals.filter(
        (r) =>
          r.status === "Returned"
      ).length,

    overdueRentals:
      activeRentals.filter(
        (r) =>
          new Date(
            r.expectedReturn
          ) < today
      ).length,

    scheduledMaintenance:
      maintenance.filter(
        (m) =>
          m.status === "Scheduled"
      ).length,

    maintenanceInProgress:
      maintenance.filter(
        (m) =>
          m.status === "In Progress"
      ).length,

    completedMaintenance:
      maintenance.filter(
        (m) =>
          m.status === "Completed"
      ).length,

    upcomingReturns:
      activeRentals.filter((r) =>
        isWithinNext7Days(
          r.expectedReturn
        )
      ).length,
  };
}

export function getEquipmentStatusData(
  equipment: EquipmentRecord[]
) {
  return [
    {
      name: "Available",
      value: equipment.filter(
        (e) =>
          e.status === "Available"
      ).length,
    },
    {
      name: "Assigned",
      value: equipment.filter(
        (e) =>
          e.status === "Assigned"
      ).length,
    },
    {
      name: "Maintenance",
      value: equipment.filter(
        (e) =>
          e.status === "Maintenance"
      ).length,
    },
  ];
}

export function getEquipmentCategoryData(
  equipment: EquipmentRecord[]
) {
  const categories =
    new Map<string, number>();

  equipment.forEach((item) => {
    categories.set(
      item.category,
      (categories.get(
        item.category
      ) ?? 0) + 1
    );
  });

  return Array.from(
    categories.entries()
  ).map(([name, value]) => ({
    name,
    value,
  }));
}