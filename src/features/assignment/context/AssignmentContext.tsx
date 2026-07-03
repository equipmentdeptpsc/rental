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
  
    addAssignment(
      assignment: AssignmentRecord
    ): void;
  
    updateAssignment(
      assignment: AssignmentRecord
    ): void;
  
    deleteAssignment(
      id: string
    ): void;
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
    const [assignments, setAssignments] =
      useState(
        assignmentRepository.getAll()
      );
  
    function refresh() {
      setAssignments(
        assignmentRepository.getAll()
      );
    }
  
    function addAssignment(
      assignment: AssignmentRecord
    ) {
      assignmentRepository.create(
        assignment
      );
  
      refresh();
    }
  
    function updateAssignment(
      assignment: AssignmentRecord
    ) {
      assignmentRepository.update(
        assignment
      );
  
      refresh();
    }
  
    function deleteAssignment(
      id: string
    ) {
      assignmentRepository.delete(id);
  
      refresh();
    }
  
    const value = useMemo(
      () => ({
        assignments,
        addAssignment,
        updateAssignment,
        deleteAssignment,
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
      useContext(AssignmentContext);
  
    if (!context) {
      throw new Error(
        "useAssignment must be used inside AssignmentProvider"
      );
    }
  
    return context;
  }