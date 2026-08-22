import {
  createContext,
  useContext,
  useMemo,
  useEffect,
  useState,
  type ReactNode,
} from "react";

import { useRental } from "@/features/rental/context/RentalContext";
import { useAssignment } from "@/features/assignment/context/AssignmentContext";
import { useEquipment } from "@/features/equipment/context/EquipmentContext";
import { useOperator } from "@/features/operators/context/OperatorContext";
import { useProject } from "@/features/project/context/ProjectContext";

import {
  buildRentalAggregate,
  type RentalAggregate,
} from "@/features/rental/aggregate";

import { isInvoicePreparationComplete } from "@/features/rental/billingstatement/services/BillingReadiness";
import { subscribeRentalWorkspaceChange } from "./workspaceRefresh";
import { resolveRentalDeurOperator } from "@/features/rental/deur/operator/resolveRentalDeurOperator";
import { resolveRentalWorkspaceEquipmentLines } from "./resolveRentalWorkspaceEquipmentLines";
import { useApplicationDependenciesCompatibility } from "@/app/composition";
import { collectionRepository } from "@/features/rental/collections/repository";
import { reconcileStatementCollections } from "@/features/rental/collections/collectionService";
import { projectRentalCollectionStatus } from "@/features/rental/collections/collectionStatusProjection";
import { useRentalListData } from "@/features/rental/hooks/useRentalListData";
import { useCanonicalRentalWorkspace } from "@/features/rental/remote/useCanonicalRentalRemoteData";
import { PersistenceMode } from "@/app/composition";
import type { RentalContractRecord } from "@/features/rental/types/RentalContract";

interface RentalWorkspaceProviderProps {
  rentalId: string;

  children: ReactNode;
}

interface RentalWorkspaceContextValue {
  aggregate: RentalAggregate;
}

const RentalWorkspaceContext =
  createContext<
    RentalWorkspaceContextValue | undefined
  >(undefined);

export default function RentalWorkspaceProvider({
  rentalId,
  children,
}: RentalWorkspaceProviderProps) {
  const dependencies = useApplicationDependenciesCompatibility();
  const { deur: deurRepository, billingStatement: billingStatementRepository } = dependencies.repositories;
  const localRental = useRental();
  const localAssignments = useAssignment().assignments;
  const localEquipment = useEquipment().equipment;
  const localOperators = useOperator().operators;
  const localProjects = useProject().projects;
  const remote = dependencies.configuration.persistenceMode === PersistenceMode.Remote;
  const fallbackList = useMemo(() => ({ rentals: localRental.rentals, rentalEquipmentLines: localRental.rentalEquipmentLines, assignments: localAssignments, equipment: localEquipment, operators: localOperators, projects: localProjects, customers: [] }), [localRental.rentals, localRental.rentalEquipmentLines, localAssignments, localEquipment, localOperators, localProjects]);
  const list = useRentalListData(fallbackList);
  const workspace = useCanonicalRentalWorkspace(rentalId);
  const rentals = list.data.rentals, rentalEquipmentLines = list.data.rentalEquipmentLines, assignments = list.data.assignments;
  const equipmentRecords = list.data.equipment, operators = list.data.operators, projects = list.data.projects;
  const contracts = remote && workspace.status === "loaded" ? workspace.data.contracts as unknown as RentalContractRecord[] : localRental.contracts;
  const [workspaceVersion, setWorkspaceVersion] = useState(0);

  useEffect(
    () => subscribeRentalWorkspaceChange(rentalId, () => setWorkspaceVersion(value => value + 1)),
    [rentalId]
  );
  const aggregate = useMemo(() => {
    const rental =
      rentals.find((item) => item.id === rentalId);

    if (!rental) {
      return undefined;
    }

    const lines = rentalEquipmentLines.filter((item) => item.rentalId === rental.id);
    const lineResolution = resolveRentalWorkspaceEquipmentLines(lines);
    const soleLine = lineResolution.kind === "sole" ? lineResolution.line : undefined;
    const deurs = deurRepository.getByRentalId(rental.id);
    const activeDeur = deurs.find(
      (d) =>
        !d.endOfDay &&
        (d.status === "Draft" || d.status === "In Progress") &&
        !d.revision?.supersededByRevisionId,
    );
    const effectiveLineId=activeDeur?.rentalEquipmentLineId??soleLine?.id;
    const contract = contracts.find((item) =>
      item.rentalEquipmentLineId === effectiveLineId || (!item.rentalEquipmentLineId&&item.id === rental.id)
    );

    const assignment =
      (soleLine?.assignmentId ?? rental.assignmentId)
        ? assignments.find((item) => item.id === (soleLine?.assignmentId ?? rental.assignmentId))
        : undefined;

    const equipment =
      equipmentRecords.find((item) => item.id === (soleLine?.equipmentId ?? rental.equipmentId));

    const operator = soleLine
      ? operators.find((item) => item.id === soleLine.operatorId)
      : resolveRentalDeurOperator(rental, operators);

    const project =
      projects.find((item) => item.id === rental.projectId);

    const statements = billingStatementRepository.getByRentalId(rental.id);
    const latestStatement = statements.at(-1);
    const collectionTotals = statements.map((statement) => reconcileStatementCollections(statement, collectionRepository.getByStatementId(statement.id)));
    const financialTotals = {
      totalInvoiced: collectionTotals.reduce((sum,item)=>sum+item.invoiceTotal,0),
      totalCollected: collectionTotals.reduce((sum,item)=>sum+item.totalCollected,0),
      outstandingBalance: collectionTotals.reduce((sum,item)=>sum+item.outstandingBalance,0),
    };
    const collection = projectRentalCollectionStatus({ hasStatement: statements.length > 0, ...financialTotals });
    const invoicePreparationComplete = isInvoicePreparationComplete(
      latestStatement?.invoiceStatus
    );

    return buildRentalAggregate({
      rental,
      rentalEquipmentLines: lines,
      contract,
      equipment,
      assignment,
      operator,
      project,
      activeDeur,
      deurs,
      billing: {
        hasStatement: statements.length > 0,
        invoiceStatus: latestStatement?.invoiceStatus,
        invoicePreparationComplete,
        subtotal: statements.reduce((sum, statement) => sum + statement.subtotal, 0),
        invoiced: collection.totalInvoiced,
        collected: collection.totalCollected,
        outstanding: collection.outstandingBalance,
        collectionStatus: collection.status,
      },
    });
  }, [rentalId, rentals, contracts, rentalEquipmentLines, assignments, equipmentRecords, operators, projects, workspaceVersion, billingStatementRepository, deurRepository]);

  if (remote && (list.status === "loading" || workspace.status === "loading")) return <div className="rounded-xl border bg-white p-8">Loading canonical Rental workspace…</div>;
  if (remote && (list.status === "error" || workspace.status === "error")) return <div className="rounded-xl border border-red-200 bg-red-50 p-8 text-red-800" role="alert">{"message" in list ? list.message : "message" in workspace ? workspace.message : "Canonical Rental workspace could not be loaded."}<button className="ml-3 underline" onClick={() => { list.retry(); workspace.retry(); }}>Retry</button></div>;
  if (!aggregate) {
    return (
      <div className="rounded-xl border bg-white p-8">
        Rental not found.
      </div>
    );
  }

  return (
    <RentalWorkspaceContext.Provider
      value={{
        aggregate,
      }}
    >
      {children}
    </RentalWorkspaceContext.Provider>
  );
}

export function useRentalWorkspaceAggregate() {
  const context =
    useContext(
      RentalWorkspaceContext
    );

  if (!context) {
    throw new Error(
      "useRentalWorkspaceAggregate must be used inside RentalWorkspaceProvider."
    );
  }

  return context.aggregate;
}
