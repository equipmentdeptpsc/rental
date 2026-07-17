import {
  createContext,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import type {
  RentalLifecycleStatus,
  RentalRecord,
} from "../types";
import type { RentalContractRecord } from "../types/RentalContract";

import { rentalRepository } from "../repository";
import { rentalContractRepository } from "../repository/rentalContractRepository";
import {
  findEquipmentBlockingRental,
  getRentalTransitionError,
  isEquipmentBlockingRental,
} from "../services/RentalWorkflowRules";
import { validateNewRentalDates } from "../utils/rentalDateValidation";

import { useAssignment } from "@/features/assignment/context/AssignmentContext";
import { useEquipment } from "@/features/equipment/context/EquipmentContext";
import { useOperator } from "@/features/operators/context/OperatorContext";
import { useProject } from "@/features/project/context/ProjectContext";
import { useAuth } from "@/features/auth/AuthContext";
import { useAudit } from "@/features/equipment/audit/AuditContext";
import {
  createHistoryEvent,
  useEquipmentHistory,
} from "@/features/equipment/history";

interface RentalTransitionResult {
  success: boolean;
  message?: string;
  rental?: RentalRecord;
}

interface RentalContextType {
  rentals: RentalRecord[];

  addRental(
    item: Omit<RentalRecord, "status" | "statusId">
  ): {
    success: boolean;
    message?: string;
  };

  updateRental(item: RentalRecord): void;

  transitionRental(
    id: string,
    nextStatus: RentalLifecycleStatus
  ): RentalTransitionResult;

  deleteRental(id: string): RentalTransitionResult;

  returnRental(id: string): RentalTransitionResult;

  releaseRental(
    id: string,
    releasedBy: string
  ): RentalTransitionResult;

  getRental(id: string): RentalRecord | undefined;

  contracts: RentalContractRecord[];

  addContract(contract: RentalContractRecord): void;
  updateContract(contract: RentalContractRecord): void;
  deleteContract(id: string): void;
  getContract(id: string): RentalContractRecord | undefined;
}

const RentalContext =
  createContext<RentalContextType | undefined>(undefined);

export function RentalProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [rentals, setRentals] =
    useState<RentalRecord[]>(rentalRepository.getAll());
  const [contracts, setContracts] =
    useState<RentalContractRecord[]>(rentalContractRepository.getAll());

  const { getEquipment, updateEquipment } = useEquipment();
  const { user } = useAuth();
  const { getAssignment, completeAssignment } = useAssignment();
  const { operators } = useOperator();
  const { projects } = useProject();
  const { logAction } = useAudit();
  const { log } = useEquipmentHistory();

  function refreshRentals() {
    setRentals([...rentalRepository.getAll()]);
  }

  function refreshContracts() {
    setContracts([...rentalContractRepository.getAll()]);
  }

  function addRental(item: RentalRecord) {
    const dateError = validateNewRentalDates(item.dateOut, item.expectedReturn);
    if (dateError) return { success: false, message: dateError };
    if (!item.rentalNumber?.trim()) {
      return {
        success: false,
        message: "Rental number is required.",
      };
    }

    if (!item.customerId?.trim() || !item.customer.trim()) {
      return {
        success: false,
        message: "Select a customer before creating a rental.",
      };
    }

    if (rentalRepository.getAll().some(
      (rental) => rental.rentalNumber === item.rentalNumber
    )) {
      return {
        success: false,
        message: "Rental number already exists.",
      };
    }

    const equipment = getEquipment(item.equipmentId);

    if (!equipment || equipment.deleted || equipment.active === false) {
      return {
        success: false,
        message: "Equipment is unavailable.",
      };
    }

    const assignment = item.assignmentId
      ? getAssignment(item.assignmentId)
      : undefined;

    const project = projects.find((candidate) => candidate.id === item.projectId);

    if (!project || project.deleted || project.status !== "Active") {
      return {
        success: false,
        message: "Select an active project.",
      };
    }

    if (!item.operatorId?.trim()) {
      return {
        success: false,
        message: "Select an operator before creating a rental.",
      };
    }

    if (!operators.some((operator) => operator.id === item.operatorId)) {
      return {
        success: false,
        message: "Selected operator was not found.",
      };
    }

    if (item.assignmentId && !assignment) {
      return {
        success: false,
        message: "Selected assignment was not found.",
      };
    }

    if (assignment && (
      assignment.status !== "Active" ||
      assignment.equipmentId !== item.equipmentId ||
      assignment.operatorId !== item.operatorId
    )) {
      return {
        success: false,
        message: "Rental relationships must match its active assignment.",
      };
    }

    // Re-read persisted records immediately before creating to protect against
    // stale pages and repeated submissions.
    if (findEquipmentBlockingRental(rentalRepository.getAll(), item.equipmentId)) {
      return {
        success: false,
        message: "Equipment already has a non-final rental.",
      };
    }

    const availableForRental =
      equipment.status === "Available" ||
      (
        equipment.status === "Assigned" &&
        assignment?.status === "Active" &&
        assignment.equipmentId === equipment.id
      );

    if (!availableForRental) {
      return {
        success: false,
        message: "Equipment is not available for rental.",
      };
    }

    const created: RentalRecord = {
      ...item,
      expectedReturn: item.expectedReturn || undefined,
      createdAt: new Date().toISOString(),
      status: "Draft",
      statusId: "",
    };
    rentalRepository.create(created);
    refreshRentals();

    const assigned = transitionRental(created.id, "Assigned");

    if (!assigned.success) {
      return assigned;
    }

    return transitionRental(created.id, "Reserved");
  }

  function updateRental(item: RentalRecord) {
    rentalRepository.update(item);
    refreshRentals();
  }

  function transitionRental(
    id: string,
    nextStatus: RentalLifecycleStatus
  ): RentalTransitionResult {
    const current = rentalRepository.getById(id);

    if (!current) {
      return {
        success: false,
        message: "Rental not found.",
      };
    }

    const error = getRentalTransitionError(current, nextStatus);

    if (error) {
      return {
        success: false,
        message: error,
      };
    }

    if (isEquipmentBlockingRental({ status: nextStatus })) {
      const blockingRental = findEquipmentBlockingRental(
        rentalRepository.getAll(),
        current.equipmentId,
        current.id,
      );
      if (blockingRental) {
        return {
          success: false,
          message: "Equipment already has a non-final rental.",
        };
      }
    }

    const equipment = getEquipment(current.equipmentId);

    if (!equipment) {
      return {
        success: false,
        message: "Equipment not found.",
      };
    }

    let updatedEquipment = equipment;

    if (nextStatus === "Assigned") {
      updatedEquipment = {
        ...equipment,
        status: "Assigned",
        projectId: current.projectId ?? equipment.projectId,
        operatorId: current.operatorId ?? equipment.operatorId,
      };
    }

    if (nextStatus === "Released") {
      updatedEquipment = {
        ...equipment,
        status: "Rented",
      };
    }

    if (nextStatus === "Returned") {
      if (equipment.status !== "Rented") {
        return {
          success: false,
          message: "Equipment is not currently rented.",
        };
      }

      const blockingRental = findEquipmentBlockingRental(
        rentalRepository.getAll(),
        current.equipmentId,
        current.id,
      );
      updatedEquipment = blockingRental
        ? {
            ...equipment,
            status: ["Released", "Active"].includes(blockingRental.status) ? "Rented" : "Assigned",
            projectId: blockingRental.projectId ?? equipment.projectId,
            operatorId: blockingRental.operatorId ?? equipment.operatorId,
          }
        : {
            ...equipment,
            status: "Available",
            projectId: "",
            operatorId: "",
          };
    }

    if (nextStatus === "Cancelled") {
      const assignment = current.assignmentId
        ? getAssignment(current.assignmentId)
        : undefined;

      updatedEquipment = assignment?.status === "Active"
        ? {
            ...equipment,
            status: "Assigned",
            projectId: assignment.projectId,
            operatorId: assignment.operatorId,
          }
        : {
            ...equipment,
            status: "Available",
            projectId: "",
            operatorId: "",
          };
    }

    const timestamp = new Date().toISOString();
    const transitionTimestamp: Partial<Record<RentalLifecycleStatus, keyof Pick<RentalRecord,
      "reservedAt" | "releasedAt" | "activatedAt" | "returnedAt" | "closedAt" | "cancelledAt"
    >>> = {
      Reserved: "reservedAt",
      Released: "releasedAt",
      Active: "activatedAt",
      Returned: "returnedAt",
      Closed: "closedAt",
      Cancelled: "cancelledAt",
    } as const;
    const timestampField = transitionTimestamp[nextStatus];

    const updated: RentalRecord = {
      ...current,
      status: nextStatus,
      ...(timestampField ? { [timestampField]: timestamp } : {}),
      actualReturn:
        nextStatus === "Returned"
          ? timestamp.split("T")[0]
          : current.actualReturn,
    };

    rentalRepository.update(updated);

    if (updatedEquipment !== equipment) {
      updateEquipment(updatedEquipment);
      logAction({
        action: "UPDATE",
        equipmentId: equipment.id,
        before: equipment,
        after: updatedEquipment,
      });
      log(createHistoryEvent(
        equipment.id,
        `Rental ${nextStatus}`,
        `Rental transitioned to ${nextStatus}.`,
        nextStatus === "Returned" || nextStatus === "Cancelled"
          ? "RENTAL_RETURN"
          : "RENTED"
      ));
    }

    if (nextStatus === "Closed") {
      updateEquipment(equipment);
      logAction({
        action: "UPDATE",
        equipmentId: equipment.id,
        before: equipment,
        after: equipment,
      });
      log(createHistoryEvent(
        equipment.id,
        "Rental Closed",
        "Rental was closed.",
        "RENTAL_RETURN"
      ));
    }

    if (nextStatus === "Returned" && current.assignmentId) {
      const assignment = getAssignment(current.assignmentId);

      if (assignment?.status === "Active") {
        completeAssignment(
          assignment.id,
          new Date().toISOString().split("T")[0]
        );
      }
    }

    refreshRentals();

    return {
      success: true,
      rental: updated,
    };
  }

  function deleteRental(id: string) {
    const rental = rentalRepository.getById(id);

    if (!rental) {
      return { success: false, message: "Rental not found." };
    }

    if (["Released", "Active", "Returned", "Closed"].includes(rental.status)) {
      return {
        success: false,
        message: "This rental is a transaction record and cannot be deleted.",
      };
    }

    rentalRepository.delete(id);
    refreshRentals();

    return { success: true };
  }

  function returnRental(id: string): RentalTransitionResult {
    return transitionRental(id, "Returned");
  }

  function releaseRental(
    id: string,
    _releasedBy: string
  ): RentalTransitionResult {
    if (user?.role !== "Admin") {
      return { success: false, message: "An Admin must release this equipment." };
    }

    const result = transitionRental(id, "Released");

    if (!result.success || !result.rental) {
      return result;
    }

    const updated = {
      ...result.rental,
      rentedBy: user.name,
    };
    rentalRepository.update(updated);
    refreshRentals();

    return { success: true, rental: updated };
  }

  function getRental(id: string) {
    return rentalRepository.getById(id);
  }

  function addContract(contract: RentalContractRecord) {
    rentalContractRepository.create(contract);
    refreshContracts();
  }

  function updateContract(contract: RentalContractRecord) {
    rentalContractRepository.update(contract);
    refreshContracts();
  }

  function deleteContract(id: string) {
    rentalContractRepository.delete(id);
    refreshContracts();
  }

  function getContract(id: string) {
    return contracts.find((contract) => contract.id === id);
  }

  const value = useMemo(
    () => ({
      rentals,
      addRental,
      updateRental,
      transitionRental,
      deleteRental,
      returnRental,
      releaseRental,
      getRental,
      contracts,
      addContract,
      updateContract,
      deleteContract,
      getContract,
    }),
    [rentals, contracts]
  );

  return (
    <RentalContext.Provider value={value}>
      {children}
    </RentalContext.Provider>
  );
}

export function useRental() {
  const context = useContext(RentalContext);

  if (!context) {
    throw new Error(
      "useRental must be used within RentalProvider"
    );
  }

  return context;
}
