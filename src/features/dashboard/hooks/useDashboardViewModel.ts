import { useMemo } from "react";
import { useAssignment } from "@/features/assignment/context/AssignmentContext";
import { useEquipment } from "@/features/equipment/context/EquipmentContext";
import { useEquipmentHistory } from "@/features/equipment/history";
import { useMaintenance } from "@/features/maintenance/context/MaintenanceContext";
import { useRental } from "@/features/rental/context/RentalContext";
import { billingStatementRepository } from "@/features/rental/billingstatement/repository";
import { collectionRepository } from "@/features/rental/collections/repository";
import { deurRepository } from "@/features/rental/deur/repository/deurRepository";
import { rentalAuditRepository } from "@/features/rental/audit/rentalAuditRepository";
import { calculateBusinessDashboardSummary } from "../services/businessDashboardSummary";
import { calculateDashboardSummary, getEquipmentCategoryData, getEquipmentStatusData } from "../services/dashboard.service";
import { calculateFleetUtilization } from "../services/fleetUtilization";
import { buildDashboardActionQueue } from "../services/dashboardActionQueue";

export function useDashboardViewModel(refreshKey = 0) {
  const { equipment } = useEquipment();
  const { assignments } = useAssignment();
  const { rentals } = useRental();
  const { maintenance } = useMaintenance();
  const { history } = useEquipmentHistory();

  return useMemo(() => {
    const operational = calculateDashboardSummary(equipment, assignments, rentals, maintenance);
    const deurs = deurRepository.getAll();
    const financial = calculateBusinessDashboardSummary({ statements: billingStatementRepository.getAll(), collections: collectionRepository.getAll(), rentals, deurs });
    const fleetUtilization = calculateFleetUtilization(equipment);
    const pendingDeur = deurs.filter((item) => ["Draft", "In Progress", "Submitted", "Pending Acknowledgement"].includes(item.status) && !item.revision?.supersededByRevisionId).length;
    const rentalActivity = rentalAuditRepository.getAll().map((item) => ({ id: `rental:${item.id}`, title: `Rental ${item.action.replaceAll("_", " ").toLowerCase()}`, description: item.remarks ?? `Rental transitioned to ${item.resultingRentalStatus}.`, timestamp: item.timestamp, actor: item.actorName ?? "System", kind: "rental" as const }));
    const equipmentActivity = history.map((item) => ({ id: `equipment:${item.id}`, equipmentId: item.equipmentId, title: item.title, description: item.description, timestamp: item.timestamp, actor: item.performedBy, kind: "equipment" as const }));
    const activity = [...rentalActivity, ...equipmentActivity].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()).slice(0, 6);
    const recentEquipmentActivity = equipmentActivity.slice().sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()).slice(0, 5).map((item) => ({ ...item, equipment: equipment.find((record) => record.id === item.equipmentId) }));
    const actionQueue = buildDashboardActionQueue({
      deurs,
      rentals,
      pendingManagerApprovals: financial.upcoming.pendingManagerApprovals,
      pendingCustomerAcknowledgements: financial.upcoming.pendingCustomerAcknowledgements,
      expectedReturns: financial.upcoming.expectedReturns,
    });
    return { operational, financial, pendingDeur, utilizationRate: fleetUtilization.rate, fleetUtilization, statusData: getEquipmentStatusData(equipment), categoryData: getEquipmentCategoryData(equipment), activity, recentEquipmentActivity, actionQueue };
  }, [assignments, equipment, history, maintenance, refreshKey, rentals]);
}
