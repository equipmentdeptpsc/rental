import {
    createContext,
    useContext,
    useMemo,
    useState,
    type ReactNode,
  } from "react";
  
  import type { Operator } from "../types";
  
  import { operatorRepository } from "../repository";
  
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
    ): void;
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
      operatorRepository.create(
        operator
      );
      refresh();
    }
  
    function updateOperator(
      operator: Operator
    ) {
      operatorRepository.update(
        operator
      );
      refresh();
    }
  
    function deleteOperator(
      id: string
    ) {
      operatorRepository.delete(id);
      refresh();
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