import type { EquipmentHistoryRecord } from "@/features/equipment/history";

import type { AssignmentRecord } from "@/features/assignment/types";
import type { DailyLogRecord } from "@/features/daily-log/types";
import type { EquipmentRecord } from "@/features/equipment/types";
import type { MaintenanceRecord } from "@/features/maintenance/types";
import type { RentalRecord } from "@/features/rental/types";

import type { DashboardSummary } from "../types";

/* ============================================================
   Dashboard Analytics Types
============================================================ */

export interface FleetKPIs {
  totalEquipment: number;

  availableEquipment: number;

  assignedEquipment: number;

  maintenanceEquipment: number;

  fleetAvailability: number;

  fleetUtilization: number;

  idleEquipment: number;

  activeAssignments: number;

  activeRentals: number;

  overdueRentals: number;

  maintenanceDue: number;

  dailyLogsToday: number;
}

export interface FleetAlert {
  id: string;

  severity:
    | "low"
    | "medium"
    | "high";

  category:
    | "Rental"
    | "Maintenance"
    | "Daily Log";

  title: string;

  description: string;
}

export interface EquipmentLeaderboard {
  equipmentId: string;

  assetNo: string;

  equipmentName: string;

  reading: number;
}

export interface DashboardAnalytics {
  kpis: FleetKPIs;

  alerts: FleetAlert[];

  topEquipment: EquipmentLeaderboard[];

  leastEquipment: EquipmentLeaderboard[];
}

/* ============================================================
   Shared Date Helpers
============================================================ */

function today() {
  return new Date();
}

function todayString() {
  return today()
    .toISOString()
    .split("T")[0];
}

function next7Days() {
  const date = today();

  date.setDate(
    date.getDate() + 7
  );

  return date;
}

function isWithinNext7Days(
  value: string | undefined
) {
  if (!value) return false;
  const start = today();

  start.setHours(
    0,
    0,
    0,
    0
  );

  const end =
    next7Days();

  end.setHours(
    23,
    59,
    59,
    999
  );

  const target =
    new Date(value);

  return (
    target >= start &&
    target <= end
  );
}

/* ============================================================
   Dashboard Summary
============================================================ */

export function calculateDashboardSummary(
  equipment: EquipmentRecord[],
  assignments: AssignmentRecord[],
  rentals: RentalRecord[],
  maintenance: MaintenanceRecord[]
): DashboardSummary {
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
        (r) => Boolean(r.expectedReturn) && new Date(r.expectedReturn!) < today()
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
          isWithinNext7Days(r.expectedReturn)
      ).length,
  };
}

/* ============================================================
   Dashboard Charts
============================================================ */

export function getEquipmentStatusData(
  equipment: EquipmentRecord[]
) {
  return [
    {
      name: "Available",
      value:
        equipment.filter(
          (e) =>
            e.status ===
            "Available"
        ).length,
    },

    {
      name: "Assigned",
      value:
        equipment.filter(
          (e) =>
            e.status ===
            "Assigned"
        ).length,
    },

    {
      name: "Maintenance",
      value:
        equipment.filter(
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

/* ============================================================
   Operational Dashboard Widgets
============================================================ */
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
        r.status === "Active" && isWithinNext7Days(r.expectedReturn)
    )
    .sort(
      (a, b) =>
        new Date(
          a.expectedReturn!
        ).getTime() -
        new Date(
          b.expectedReturn!
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

/* ============================================================
   Fleet Analytics
============================================================ */

function buildLeaderboard(
  equipment: EquipmentRecord[]
): EquipmentLeaderboard[] {
  return [...equipment]
    .sort(
      (a, b) =>
        b.currentReading -
        a.currentReading
    )
    .map((item) => ({
      equipmentId:
        item.id,

      assetNo:
        item.assetNo,

      equipmentName:
        item.equipmentName,

      reading:
        item.currentReading,
    }));
}

function buildAlerts(
  equipment: EquipmentRecord[],
  rentals: RentalRecord[],
  maintenance: MaintenanceRecord[],
  logs: DailyLogRecord[]
): FleetAlert[] {
  const alerts: FleetAlert[] =
    [];

  const todayLogs =
    logs.filter(
      (l) =>
        l.date ===
        todayString()
    );

  rentals
    .filter(
      (r) =>
        r.status === "Active" && Boolean(r.expectedReturn) && new Date(r.expectedReturn!) < today()
    )
    .forEach((item) => {
      alerts.push({
        id: crypto.randomUUID(),

        severity:
          "high",

        category:
          "Rental",

        title:
          "Rental Overdue",

        description:
          `${item.customer} has not returned rented equipment.`,
      });
    });

  maintenance
    .filter(
      (m) =>
        m.status ===
          "Scheduled" &&
        isWithinNext7Days(
          m.scheduledDate
        )
    )
    .forEach((item) => {
      alerts.push({
        id: crypto.randomUUID(),

        severity:
          "medium",

        category:
          "Maintenance",

        title:
          "Maintenance Due",

        description:
          `${item.maintenanceType} scheduled on ${item.scheduledDate}`,
      });
    });

  equipment.forEach(
    (machine) => {
      if (
        !todayLogs.some(
          (log) =>
            log.equipmentId ===
            machine.id
        )
      ) {
        alerts.push({
          id: crypto.randomUUID(),

          severity:
            "low",

          category:
            "Daily Log",

          title:
            "No Daily Log",

          description:
            `${machine.assetNo} has no daily log today.`,
        });
      }
    }
  );

  return alerts;
}
export function buildDashboardAnalytics(
  equipment: EquipmentRecord[],
  assignments: AssignmentRecord[],
  rentals: RentalRecord[],
  maintenance: MaintenanceRecord[],
  logs: DailyLogRecord[]
): DashboardAnalytics {

  const totalEquipment =
    equipment.length;

  const availableEquipment =
    equipment.filter(
      (e) =>
        e.status ===
        "Available"
    ).length;

  const assignedEquipment =
    equipment.filter(
      (e) =>
        e.status ===
        "Assigned"
    ).length;

  const maintenanceEquipment =
    equipment.filter(
      (e) =>
        e.status ===
        "Maintenance"
    ).length;

  const activeAssignments =
    assignments.filter(
      (a) =>
        a.status ===
        "Active"
    ).length;

  const activeRentals =
    rentals.filter(
      (r) =>
        r.status ===
        "Active"
    );

  const overdueRentals =
    activeRentals.filter(
      (r) =>
        Boolean(r.expectedReturn) && new Date(r.expectedReturn!) < today()
    );

  const maintenanceDue =
    maintenance.filter(
      (m) =>
        m.status ===
          "Scheduled" &&
        isWithinNext7Days(
          m.scheduledDate
        )
    );

  const logsToday =
    logs.filter(
      (l) =>
        l.date ===
        todayString()
    );

  const idleEquipment =
    equipment.filter(
      (e) =>
        e.status ===
          "Available" &&
        !logsToday.some(
          (log) =>
            log.equipmentId ===
            e.id
        )
    ).length;

  const leaderboard =
    buildLeaderboard(
      equipment
    );

  return {

    kpis: {

      totalEquipment,

      availableEquipment,

      assignedEquipment,

      maintenanceEquipment,

      fleetAvailability:
        totalEquipment === 0
          ? 0
          : Math.round(
              (availableEquipment /
                totalEquipment) *
                100
            ),

      fleetUtilization:
        totalEquipment === 0
          ? 0
          : Math.round(
              ((assignedEquipment +
                activeRentals.length) /
                totalEquipment) *
                100
            ),

      idleEquipment,

      activeAssignments,

      activeRentals:
        activeRentals.length,

      overdueRentals:
        overdueRentals.length,

      maintenanceDue:
        maintenanceDue.length,

      dailyLogsToday:
        logsToday.length,

    },

    alerts:
      buildAlerts(
        equipment,
        rentals,
        maintenance,
        logs
      ),

    topEquipment:
      leaderboard.slice(
        0,
        5
      ),

    leastEquipment:
      [...leaderboard]
        .reverse()
        .slice(0, 5),

  };

}
