import {
  createContext,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import type { AssignmentRecord } from "../types";

import { assignmentRepository } from "../repository";

interface AssignmentContextType {
  assignments: AssignmentRecord[];

  activeAssignments:
    AssignmentRecord[];

  addAssignment(
    assignment: AssignmentRecord
  ): boolean;

  updateAssignment(
    assignment: AssignmentRecord
  ): void;

  completeAssignment(
    id: string,
    returnedDate: string
  ): AssignmentRecord | undefined;

  deleteAssignment(
    id: string
  ): void;

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
    if (
      isEquipmentAssigned(
        assignment.equipmentId
      )
    )
      return false;

    if (
      isOperatorAssigned(
        assignment.operatorId
      )
    )
      return false;

    assignmentRepository.create(
      assignment
    );

    refresh();

    return true;
  }

  function updateAssignment(
    assignment: AssignmentRecord
  ) {
    assignmentRepository.update(
      assignment
    );

    refresh();
  }

  function completeAssignment(
    id: string,
    returnedDate: string
  ) {
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

  function deleteAssignment(
    id: string
  ) {
    assignmentRepository.delete(
      id
    );

    refresh();
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
      deleteAssignment,
      getAssignment,
      isEquipmentAssigned,
      isOperatorAssigned,
    }),
    [assignments]
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