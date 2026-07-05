import StatisticCard from "./statistic-card";
import type { DashboardSummary } from "../types";

interface StatisticsGridProps {
  summary: DashboardSummary;
}

export default function StatisticsGrid({
  summary,
}: StatisticsGridProps) {
  return (
    <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-4">
      <StatisticCard
        title="Total Equipment"
        value={summary.totalEquipment}
      />

      <StatisticCard
        title="Available"
        value={summary.availableEquipment}
      />

      <StatisticCard
        title="Assigned"
        value={summary.assignedEquipment}
      />

      <StatisticCard
        title="Maintenance"
        value={summary.maintenanceEquipment}
      />

      <StatisticCard
        title="Active Rentals"
        value={summary.activeRentals}
      />

      <StatisticCard
        title="Active Assignments"
        value={summary.activeAssignments}
      />

      <StatisticCard
        title="Overdue Rentals"
        value={summary.overdueRentals}
      />

      <StatisticCard
        title="Upcoming Returns"
        value={summary.upcomingReturns}
      />
    </div>
  );
}