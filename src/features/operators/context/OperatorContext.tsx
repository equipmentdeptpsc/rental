import {
    createContext,
    useContext,
    useMemo,
    useState,
    type ReactNode,
  } from "react";
  
  import type { Operator } from "../types";
  
  import { operatorRepository } from "../repository";
  import { guardOperatorDeletion } from "@/features/relationships/deletionGuards";
  import { useOptionalAuth } from "@/features/auth/AuthContext";
  import { AuthorizationError } from "@/features/auth/services/AuthorizationError";
  
  interface OperatorContextType {
    operators: Operator[];
  
    addOperator(
      operator: Operator
    ): void;
  
    updateOperator(
      operator: Operator
    ): void;
  
    deleteOperator(
      id: string
    ): { success: boolean; message?: string };
  }
  
  const OperatorContext =
    createContext<
      OperatorContextType | undefined
    >(undefined);
  
  export function OperatorProvider({
    children,
  }: {
    children: ReactNode;
  }) {
    const auth = useOptionalAuth();
    const authorize = () => {
      if (auth && !auth.hasPermission("operator.manage")) throw new AuthorizationError("operator.manage");
    };
    const [operators, setOperators] =
      useState(
        operatorRepository.getAll()
      );
  
    function refresh() {
      setOperators(
        operatorRepository.getAll()
      );
    }
  
    function addOperator(
      operator: Operator
    ) {
      authorize();
      operatorRepository.create(
        operator
      );
      refresh();
    }
  
    function updateOperator(
      operator: Operator
    ) {
      authorize();
      operatorRepository.update(
        operator
      );
      refresh();
    }
  
    function deleteOperator(
      id: string
    ) {
      authorize();
      const result = guardOperatorDeletion(id);

      if (!result.success) return result;

      operatorRepository.delete(id);
      refresh();

      return result;
    }
  
    const value = useMemo(
      () => ({
        operators,
        addOperator,
        updateOperator,
        deleteOperator,
      }),
      [operators]
    );
  
    return (
      <OperatorContext.Provider
        value={value}
      >
        {children}
      </OperatorContext.Provider>
    );
  }
  
  export function useOperator() {
    const context =
      useContext(OperatorContext);
  
    if (!context) {
      throw new Error(
        "useOperator must be used inside OperatorProvider"
      );
    }
  
    return context;
  }
