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

import { deurRepository } from "@/features/rental/deur/repository/deurRepository";
import { billingStatementRepository } from "@/features/rental/billingstatement/repository";
import { isInvoicePreparationComplete } from "@/features/rental/billingstatement/services/BillingReadiness";
import { subscribeRentalWorkspaceChange } from "./workspaceRefresh";
import { resolveRentalDeurOperator } from "@/features/rental/deur/operator/resolveRentalDeurOperator";

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
  const { rentals, contracts } = useRental();
  const { assignments } = useAssignment();
  const { equipment: equipmentRecords } = useEquipment();
  const { operators } = useOperator();
  const { projects } = useProject();
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

    const contract = contracts.find((item) => item.id === rental.id);

    const assignment =
      rental.assignmentId
        ? assignments.find((item) => item.id === rental.assignmentId)
        : undefined;

    const equipment =
      equipmentRecords.find((item) => item.id === rental.equipmentId);

    const operator = resolveRentalDeurOperator(rental, operators);

    const project =
      projects.find((item) => item.id === rental.projectId);

    // NEW
    const deurs =
      deurRepository.getByRentalId(
        rental.id
      );

    const statements = billingStatementRepository.getAll().filter(
      statement => statement.rentalId === rental.id
    );
    const latestStatement = statements.at(-1);
    const invoicePreparationComplete = isInvoicePreparationComplete(
      latestStatement?.invoiceStatus
    );

      const activeDeur =
      deurs.find(
        (d) =>
          !d.endOfDay &&
          d.status !== "Billed"
      );

    return buildRentalAggregate({
      rental,
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
      },
    });
  }, [rentalId, rentals, contracts, assignments, equipmentRecords, operators, projects, workspaceVersion]);

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
