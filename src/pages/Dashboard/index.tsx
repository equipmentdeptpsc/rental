import {
  calculateDashboardSummary,
  getEquipmentStatusData,
  getEquipmentCategoryData,
  EquipmentStatusChart,
  EquipmentCategoryChart,
} from "@/features/dashboard";

import StatisticsGrid
  from "@/features/dashboard/components/statistics-grid";

import { useEquipment }
  from "@/features/equipment/context/EquipmentContext";

import { useAssignment }
  from "@/features/assignment/context/AssignmentContext";

import { useRental }
  from "@/features/rental/context/RentalContext";

import { useMaintenance }
  from "@/features/maintenance/context/MaintenanceContext";

export default function Dashboard() {
  const { equipment } =
    useEquipment();

  const { assignments } =
    useAssignment();

  const { rentals } =
    useRental();

  const { maintenance } =
    useMaintenance();

  const summary =
    calculateDashboardSummary(
      equipment,
      assignments,
      rentals,
      maintenance
    );

  const equipmentStatus =
    getEquipmentStatusData(
      equipment
    );

  const categoryData =
    getEquipmentCategoryData(
      equipment
    );

  return (
    <div className="space-y-8 p-8">
      <div>
        <h1 className="text-3xl font-bold">
          Equipment Rental Dashboard
        </h1>

        <p className="mt-2 text-gray-500">
          Welcome to Project Legacy.
        </p>
      </div>

      <StatisticsGrid
        summary={summary}
      />

      <div className="grid gap-6 xl:grid-cols-2">
        <EquipmentStatusChart
          data={equipmentStatus}
        />

        <EquipmentCategoryChart
          data={categoryData}
        />
      </div>
    </div>
  );
}