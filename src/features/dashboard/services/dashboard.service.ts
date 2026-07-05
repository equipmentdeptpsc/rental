import type { EquipmentHistoryRecord } from "@/features/equipment/history";

import type { AssignmentRecord } from "@/features/assignment/types";
import type { EquipmentRecord } from "@/features/equipment/types";
import type { MaintenanceRecord } from "@/features/maintenance/types";
import type { RentalRecord } from "@/features/rental/types";

import type { DashboardSummary } from "../types";

function isWithinNext7Days(date: string) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const target = new Date(date);
  target.setHours(0, 0, 0, 0);

  const diff =
    target.getTime() -
    today.getTime();

  const days =
    diff /
    (1000 * 60 * 60 * 24);

  return (
    days >= 0 &&
    days <= 7
  );
}

export function calculateDashboardSummary(
  equipment: EquipmentRecord[],
  assignments: AssignmentRecord[],
  rentals: RentalRecord[],
  maintenance: MaintenanceRecord[]
): DashboardSummary {
  const today =
    new Date();

  const activeRentals =
    rentals.filter(
      (r) =>
        r.status ===
        "Active"
    );

  return {
    totalEquipment:
      equipment.length,

    availableEquipment:
      equipment.filter(
        (e) =>
          e.status ===
          "Available"
      ).length,

    assignedEquipment:
      equipment.filter(
        (e) =>
          e.status ===
          "Assigned"
      ).length,

    maintenanceEquipment:
      equipment.filter(
        (e) =>
          e.status ===
          "Maintenance"
      ).length,

    activeAssignments:
      assignments.filter(
        (a) =>
          a.status ===
          "Active"
      ).length,

    completedAssignments:
      assignments.filter(
        (a) =>
          a.status ===
          "Completed"
      ).length,

    activeRentals:
      activeRentals.length,

    returnedRentals:
      rentals.filter(
        (r) =>
          r.status ===
          "Returned"
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
          m.status ===
          "Scheduled"
      ).length,

    maintenanceInProgress:
      maintenance.filter(
        (m) =>
          m.status ===
          "In Progress"
      ).length,

    completedMaintenance:
      maintenance.filter(
        (m) =>
          m.status ===
          "Completed"
      ).length,

    upcomingReturns:
      activeRentals.filter(
        (r) =>
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
          e.status ===
          "Available"
      ).length,
    },
    {
      name: "Assigned",
      value: equipment.filter(
        (e) =>
          e.status ===
          "Assigned"
      ).length,
    },
    {
      name: "Maintenance",
      value: equipment.filter(
        (e) =>
          e.status ===
          "Maintenance"
      ).length,
    },
  ];
}

export function getEquipmentCategoryData(
  equipment: EquipmentRecord[]
) {
  const categories =
    new Map<
      string,
      number
    >();

  equipment.forEach(
    (item) => {
      categories.set(
        item.category,
        (categories.get(
          item.category
        ) ?? 0) + 1
      );
    }
  );

  return Array.from(
    categories.entries()
  ).map(
    ([name, value]) => ({
      name,
      value,
    })
  );
}

/* =======================================================
   Dashboard Operational Widgets
======================================================= */

export function getRecentAssignments(
  assignments: AssignmentRecord[],
  limit = 5
) {
  return [...assignments]
    .sort(
      (a, b) =>
        new Date(
          b.assignedDate
        ).getTime() -
        new Date(
          a.assignedDate
        ).getTime()
    )
    .slice(0, limit);
}

export function getRecentRentals(
  rentals: RentalRecord[],
  limit = 5
) {
  return [...rentals]
    .sort(
      (a, b) =>
        new Date(
          b.dateOut
        ).getTime() -
        new Date(
          a.dateOut
        ).getTime()
    )
    .slice(0, limit);
}

export function getUpcomingReturns(
  rentals: RentalRecord[]
) {
  return rentals
    .filter(
      (r) =>
        r.status ===
          "Active" &&
        isWithinNext7Days(
          r.expectedReturn
        )
    )
    .sort(
      (a, b) =>
        new Date(
          a.expectedReturn
        ).getTime() -
        new Date(
          b.expectedReturn
        ).getTime()
    );
}

export function getUpcomingMaintenance(
  maintenance: MaintenanceRecord[]
) {
  return maintenance
    .filter(
      (m) =>
        m.status ===
          "Scheduled" &&
        isWithinNext7Days(
          m.scheduledDate
        )
    )
    .sort(
      (a, b) =>
        new Date(
          a.scheduledDate
        ).getTime() -
        new Date(
          b.scheduledDate
        ).getTime()
    );
}

export function getRecentHistory(
  history: EquipmentHistoryRecord[],
  limit = 8
) {
  return [...history]
    .sort(
      (a, b) =>
        new Date(
          b.timestamp
        ).getTime() -
        new Date(
          a.timestamp
        ).getTime()
    )
    .slice(0, limit);
}