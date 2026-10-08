import { useEffect, useMemo, useState } from "react";
import { useApplicationDependenciesCompatibility, PersistenceMode } from "@/app/composition";
import { useAssignment } from "@/features/assignment/context/AssignmentContext";
import { useEquipment } from "@/features/equipment/context/EquipmentContext";
import { useEquipmentHistory } from "@/features/equipment/history";
import { useMaintenance } from "@/features/maintenance/context/MaintenanceContext";
import { useRental } from "@/features/rental/context/RentalContext";
import { useAuth } from "@/features/auth/AuthContext";
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
  const { readRepositories, configuration } = useApplicationDependenciesCompatibility();
  const { user, hasPermission } = useAuth();
  const remote = configuration.persistenceMode === PersistenceMode.Remote;
  const [remoteState, setRemoteState] = useState<{
    status: "loading" | "loaded" | "error";
    equipment: typeof equipment;
    assignments: typeof assignments;
    rentals: typeof rentals;
    deurs: ReturnType<typeof deurRepository.getAll>;
    statements: ReturnType<typeof billingStatementRepository.getAll>;
    activity: Array<{ id: string; title: string; description: string; timestamp: string; actor: string; kind: "rental" }>;
    message?: string;
  }>({ status: remote ? "loading" : "loaded", equipment: [], assignments: [], rentals: [], deurs: [], statements: [], activity: [] });

  useEffect(() => {
    if (!remote) {
      setRemoteState({ status: "loaded", equipment: [], assignments: [], rentals: [], deurs: [], statements: [], activity: [] });
      return;
    }
    let active = true;
    setRemoteState((current) => ({ ...current, status: "loading", message: undefined }));
    void Promise.all([
      readRepositories.equipment.list(),
      readRepositories.assignments.list(),
      readRepositories.rentals.list(),
    ]).then(async ([equipmentResult, assignmentResult, rentalResult]) => {
      if (!active) return;
      if (!equipmentResult.success || !assignmentResult.success || !rentalResult.success) {
        setRemoteState((current) => ({ ...current, status: "error", message: "Dashboard data could not be loaded. Retry the request or contact support." }));
        return;
      }
      const [deurResult, statementResult, auditResult] = await Promise.allSettled([
        readRepositories.deurs.list(), readRepositories.billing.list(), readRepositories.canonicalAudit.list(),
      ]);
      const deurs = deurResult.status === "fulfilled" && deurResult.value.success ? deurResult.value.value.items : [];
      const statements = statementResult.status === "fulfilled" && statementResult.value.success ? statementResult.value.value.items : [];
      const audit = auditResult.status === "fulfilled" && auditResult.value.success ? auditResult.value.value.items : [];
      setRemoteState({
        status: "loaded",
        equipment: equipmentResult.value.items,
        assignments: assignmentResult.value.items,
        rentals: rentalResult.value.items,
        deurs,
        statements,
        activity: audit.map((item) => ({
          id: `audit:${item.id}`,
          title: `${item.aggregateType} ${item.action.replaceAll("_", " ").toLowerCase()}`,
          description: `${item.aggregateType} activity recorded in the audit log.`,
          timestamp: item.occurredAt,
          actor: item.actorName ?? "System",
          kind: "rental" as const,
        })),
      });
    }).catch(() => {
      if (active) setRemoteState((current) => ({ ...current, status: "error", message: "Dashboard data could not be loaded. Retry the request or contact support." }));
    });
    return () => { active = false; };
  }, [readRepositories, remote, refreshKey]);

  return useMemo(() => {
    const sourceEquipment = remote ? remoteState.equipment : equipment;
    const sourceAssignments = remote ? remoteState.assignments : assignments;
    const sourceRentals = remote ? remoteState.rentals : rentals;
    const deurs = remote ? remoteState.deurs : deurRepository.getAll();
    const statements = remote ? remoteState.statements : billingStatementRepository.getAll();
    const sourceMaintenance = remote ? [] : maintenance;
    const financial = calculateBusinessDashboardSummary({ statements, collections: remote ? [] : collectionRepository.getAll(), rentals: sourceRentals, deurs, currentUserId: user?.id, approvalPermissionGranted: hasPermission("rental.approval.decide") });
    const operational = calculateDashboardSummary(sourceEquipment, sourceAssignments, sourceRentals, sourceMaintenance);
    const fleetUtilization = calculateFleetUtilization(sourceEquipment);
    const pendingDeur = deurs.filter((item) => ["Draft", "In Progress", "Submitted", "Pending Acknowledgement"].includes(item.status) && !item.revision?.supersededByRevisionId).length;
    const rentalActivity = remote ? remoteState.activity : rentalAuditRepository.getAll().map((item) => ({ id: `rental:${item.id}`, title: `Rental ${item.action.replaceAll("_", " ").toLowerCase()}`, description: item.remarks ?? `Rental transitioned to ${item.resultingRentalStatus}.`, timestamp: item.timestamp, actor: item.actorName ?? "System", kind: "rental" as const }));
    const equipmentActivity = history.map((item) => ({ id: `equipment:${item.id}`, equipmentId: item.equipmentId, title: item.title, description: item.description, timestamp: item.timestamp, actor: item.performedBy, kind: "equipment" as const }));
    const activity = [...rentalActivity, ...equipmentActivity].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()).slice(0, 6);
    const recentEquipmentActivity = equipmentActivity.slice().sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()).slice(0, 5).map((item) => ({ ...item, equipment: sourceEquipment.find((record) => record.id === item.equipmentId) }));
    const actionQueue = buildDashboardActionQueue({
      deurs,
      rentals: sourceRentals,
      pendingManagerApprovals: financial.upcoming.pendingManagerApprovals,
      pendingCustomerAcknowledgements: financial.upcoming.pendingCustomerAcknowledgements,
      expectedReturns: financial.upcoming.expectedReturns,
    });
    return { status: remote ? remoteState.status : "loaded" as const, error: remoteState.message, retry: () => undefined, operational, financial, pendingDeur, utilizationRate: fleetUtilization.rate, fleetUtilization, statusData: getEquipmentStatusData(sourceEquipment), categoryData: getEquipmentCategoryData(sourceEquipment), activity, recentEquipmentActivity, actionQueue };
  }, [assignments, equipment, hasPermission, history, maintenance, remote, remoteState, rentals, user?.id]);
}
