import {
  StatisticsGrid,
  EquipmentStatusChart,
  EquipmentCategoryChart,
  RecentAssignments,
  RecentRentals,
  UpcomingReturns,
  UpcomingMaintenance,
  RecentHistory,
  calculateDashboardSummary,
  getEquipmentCategoryData,
  getEquipmentStatusData,
  getRecentAssignments,
  getRecentRentals,
  getUpcomingReturns,
  getUpcomingMaintenance,
  getRecentHistory,
} from "@/features/dashboard";

import { useEquipment } from "@/features/equipment/context/EquipmentContext";
import { useAssignment } from "@/features/assignment/context/AssignmentContext";
import { useRental } from "@/features/rental/context/RentalContext";
import { useMaintenance } from "@/features/maintenance/context/MaintenanceContext";
import { useOperator } from "@/features/operators/context/OperatorContext";
import { useProject } from "@/features/project/context/ProjectContext";
import { useEquipmentHistory } from "@/features/equipment/history";

export default function Dashboard() {
  const { equipment } = useEquipment();

  const { assignments } =
    useAssignment();

  const { rentals } =
    useRental();

  const { maintenance } =
    useMaintenance();

  const { operators } =
    useOperator();

  const { projects } =
    useProject();

  const { history } =
    useEquipmentHistory();

  const summary =
    calculateDashboardSummary(
      equipment,
      assignments,
      rentals,
      maintenance
    );

  return (
    <div className="space-y-8 p-8">
      <div>
        <h1 className="text-3xl font-bold">
          Equipment Rental Dashboard
        </h1>

        <p className="mt-2 text-gray-500">
          Fleet overview and operational
          summary.
        </p>
      </div>

      <StatisticsGrid
        summary={summary}
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <EquipmentStatusChart
          data={getEquipmentStatusData(
            equipment
          )}
        />

        <EquipmentCategoryChart
          data={getEquipmentCategoryData(
            equipment
          )}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <RecentAssignments
          assignments={getRecentAssignments(
            assignments
          )}
          equipment={equipment}
          operators={operators}
          projects={projects}
        />

        <RecentRentals
          rentals={getRecentRentals(
            rentals
          )}
          equipment={equipment}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <UpcomingReturns
          rentals={getUpcomingReturns(
            rentals
          )}
          equipment={equipment}
        />

        <UpcomingMaintenance
          maintenance={getUpcomingMaintenance(
            maintenance
          )}
          equipment={equipment}
        />
      </div>

      <RecentHistory
        history={getRecentHistory(
          history
        )}
        equipment={equipment}
      />
    </div>
  );
}