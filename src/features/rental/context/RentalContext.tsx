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
import { getRentalTransitionError } from "../services/RentalWorkflowRules";

import { useAssignment } from "@/features/assignment/context/AssignmentContext";
import { useEquipment } from "@/features/equipment/context/EquipmentContext";
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
    item: RentalRecord
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
  const { getAssignment, completeAssignment } = useAssignment();
  const { logAction } = useAudit();
  const { log } = useEquipmentHistory();

  function refreshRentals() {
    setRentals([...rentalRepository.getAll()]);
  }

  function refreshContracts() {
    setContracts([...rentalContractRepository.getAll()]);
  }

  function addRental(item: RentalRecord) {
    if (!item.rentalNumber?.trim()) {
      return {
        success: false,
        message: "Rental number is required.",
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

    rentalRepository.create({
      ...item,
      status: "Draft",
    });
    refreshRentals();

    const assigned = transitionRental(item.id, "Assigned");

    if (!assigned.success) {
      return assigned;
    }

    return transitionRental(item.id, "Reserved");
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

      updatedEquipment = {
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

    const updated: RentalRecord = {
      ...current,
      status: nextStatus,
      actualReturn:
        nextStatus === "Returned"
          ? new Date().toISOString().split("T")[0]
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
