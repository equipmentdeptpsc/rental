import {
  StatisticsGrid,
  EquipmentStatusChart,
  EquipmentCategoryChart,
  RecentAssignments,
  RecentRentals,
  UpcomingReturns,
  UpcomingMaintenance,
  RecentHistory,
  RecentActivity,
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

import FleetUtilization from "@/features/dashboard/components/DashboardWidgets/FleetUtilization";
import { billingStatementRepository } from "@/features/rental/billingstatement/repository";
import { collectionRepository } from "@/features/rental/collections/repository";
import { deurRepository } from "@/features/rental/deur/repository/deurRepository";
import { calculateBusinessDashboardSummary } from "@/features/dashboard/services/businessDashboardSummary";
import { Link } from "react-router-dom";

export default function Dashboard() {
  const { equipment } = useEquipment();

  const { assignments } = useAssignment();

  const { rentals } = useRental();

  const { maintenance } = useMaintenance();

  const { operators } = useOperator();

  const { projects } = useProject();

  const { history } = useEquipmentHistory();

  const summary = calculateDashboardSummary(
    equipment,
    assignments,
    rentals,
    maintenance
  );
  const business=calculateBusinessDashboardSummary({statements:billingStatementRepository.getAll(),collections:collectionRepository.getAll(),rentals,deurs:deurRepository.getAll()});
  const currency=(value:number)=>new Intl.NumberFormat("en-PH",{style:"currency",currency:"PHP"}).format(value);

  return (
    <div className="space-y-8 p-8">
      <div>
        <h1 className="text-3xl font-bold">
          Equipment Rental Dashboard
        </h1>

        <p className="mt-2 text-gray-500">
          Fleet overview and operational summary.
        </p>
      </div>

      <StatisticsGrid summary={summary} />
      <div className="grid gap-5 md:grid-cols-3">
        <section className="rounded-xl border bg-white p-5"><h2 className="font-semibold">Revenue</h2><p className="mt-3">Billed: <b>{currency(business.revenue.billed)}</b></p><p>Collected: <b>{currency(business.revenue.collected)}</b></p><p>Outstanding: <b>{currency(business.revenue.outstanding)}</b></p><Link className="mt-3 inline-block text-sm text-blue-700" to="/billing">Open Billing</Link></section>
        <section className="rounded-xl border bg-white p-5"><h2 className="font-semibold">Upcoming</h2><p className="mt-3">Scheduled releases: <b>{business.upcoming.scheduledRelease}</b></p><p>Expected returns: <b>{business.upcoming.expectedReturns}</b></p><p>Manager approvals: <b>{business.upcoming.pendingManagerApprovals}</b></p><p>Customer acknowledgements: <b>{business.upcoming.pendingCustomerAcknowledgements}</b></p></section>
        <section className="rounded-xl border bg-white p-5"><h2 className="font-semibold">Collection Performance</h2><p className="mt-3">Collection rate: <b>{business.collectionPerformance.collectionRate.toFixed(2)}%</b></p><p>Collected: <b>{currency(business.collectionPerformance.totalCollected)}</b></p><p>Outstanding: <b>{currency(business.collectionPerformance.outstanding)}</b></p></section>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <EquipmentStatusChart
          data={getEquipmentStatusData(equipment)}
        />

        <EquipmentCategoryChart
          data={getEquipmentCategoryData(equipment)}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <FleetUtilization />

        <RecentActivity history={history} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <RecentAssignments
          assignments={getRecentAssignments(assignments)}
          equipment={equipment}
          operators={operators}
          projects={projects}
        />

        <RecentRentals
          rentals={getRecentRentals(rentals)}
          equipment={equipment}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <UpcomingReturns
          rentals={getUpcomingReturns(rentals)}
          equipment={equipment}
        />

        <UpcomingMaintenance
          maintenance={getUpcomingMaintenance(maintenance)}
          equipment={equipment}
        />
      </div>

      <RecentHistory
        history={getRecentHistory(history)}
        equipment={equipment}
      />
    </div>
  );
}
