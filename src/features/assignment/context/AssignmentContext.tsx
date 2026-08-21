import {
  createContext,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import type { AssignmentRecord } from "../types";
import { getActiveAssignmentConflictMessage, hasActiveAssignmentConflict } from "../utils/selectAvailableEquipment";

import { useApplicationDependenciesCompatibility } from "@/app/composition";
import { useOptionalAuth } from "@/features/auth/AuthContext";
import { AuthorizationError } from "@/features/auth/services/AuthorizationError";

interface AssignmentContextType {
  assignments: AssignmentRecord[];

  activeAssignments:
    AssignmentRecord[];

  addAssignment(
    assignment: AssignmentRecord
  ): boolean;

  updateAssignment(
    assignment: AssignmentRecord
  ): boolean;

  completeAssignment(
    id: string,
    returnedDate: string
  ): AssignmentRecord | undefined;

  cancelAssignment(id: string): AssignmentRecord | undefined;

  deleteAssignment(
    id: string
  ): { success: boolean; message?: string };

  getAssignment(
    id: string
  ): AssignmentRecord | undefined;

  isEquipmentAssigned(
    equipmentId: string
  ): boolean;

  isOperatorAssigned(
    operatorId: string
  ): boolean;
}

const AssignmentContext =
  createContext<
    AssignmentContextType | undefined
  >(undefined);

export function AssignmentProvider({
  children,
}: {
  children: ReactNode;
}) {
  const { assignment: assignmentRepository, rental: rentalRepository } = useApplicationDependenciesCompatibility().repositories;
  const auth = useOptionalAuth();
  const authorize = () => {
    if (auth && !auth.hasPermission("assignment.manage")) throw new AuthorizationError("assignment.manage");
  };
  const [
    assignments,
    setAssignments,
  ] = useState(
    assignmentRepository.getAll()
  );

  function refresh() {
    setAssignments(
      assignmentRepository.getAll()
    );
  }

  const activeAssignments =
    assignments.filter(
      (a) =>
        a.status ===
        "Active"
    );

  function isEquipmentAssigned(
    equipmentId: string
  ) {
    return activeAssignments.some(
      (a) =>
        a.equipmentId ===
        equipmentId
    );
  }

  function isOperatorAssigned(
    operatorId: string
  ) {
    return activeAssignments.some(
      (a) =>
        a.operatorId ===
        operatorId
    );
  }

  function addAssignment(
    assignment: AssignmentRecord
  ) {
    authorize();
    const conflict = getActiveAssignmentConflictMessage(activeAssignments, assignment);
    if (conflict) {
      if (assignment.startDate) throw new Error(conflict);
      return false;
    }

    assignmentRepository.create(
      assignment
    );

    refresh();

    return true;
  }

  function updateAssignment(
    assignment: AssignmentRecord
  ) {
    authorize();
    if (assignment.status === "Active") {
      if (hasActiveAssignmentConflict(activeAssignments, assignment, assignment.id)) {
        const conflict = getActiveAssignmentConflictMessage(activeAssignments, assignment, assignment.id);
        if (assignment.startDate && conflict) throw new Error(conflict);
        return false;
      }
    }

    assignmentRepository.update(
      assignment
    );

    refresh();

    return true;
  }

  function completeAssignment(
    id: string,
    returnedDate: string
  ) {
    authorize();
    const existing =
      assignmentRepository.getById(
        id
      );

    if (!existing)
      return undefined;

    const updated = {
      ...existing,
      status:
        "Completed" as const,
      returnedDate,
    };

    assignmentRepository.update(
      updated
    );

    refresh();

    return updated;
  }

  function cancelAssignment(id: string) {
    authorize();
    const existing = assignmentRepository.getById(id);
    if (!existing) return undefined;
    const updated = { ...existing, status: "Cancelled" as const };
    assignmentRepository.update(updated);
    refresh();
    return updated;
  }

  function deleteAssignment(
    id: string
  ) {
    authorize();
    if (rentalRepository.getAll().some((rental) => rental.assignmentId === id)) {
      return {
        success: false,
        message: "This assignment is linked to a rental and cannot be deleted.",
      };
    }

    assignmentRepository.delete(
      id
    );

    refresh();

    return { success: true };
  }

  function getAssignment(
    id: string
  ) {
    return assignments.find(
      (a) => a.id === id
    );
  }

  const value = useMemo(
    () => ({
      assignments,
      activeAssignments,
      addAssignment,
      updateAssignment,
      completeAssignment,
      cancelAssignment,
      deleteAssignment,
      getAssignment,
      isEquipmentAssigned,
      isOperatorAssigned,
    }),
    [assignments, auth]
  );

  return (
    <AssignmentContext.Provider
      value={value}
    >
      {children}
    </AssignmentContext.Provider>
  );
}

export function useAssignment() {
  const context =
    useContext(
      AssignmentContext
    );

  if (!context) {
    throw new Error(
      "useAssignment must be used inside AssignmentProvider"
    );
  }

  return context;
}
