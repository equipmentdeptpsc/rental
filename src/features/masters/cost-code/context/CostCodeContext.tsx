import {
    createContext,
    useContext,
    useMemo,
    useState,
    type ReactNode,
  } from "react";
  
  import type {
    CostCodeRecord,
  } from "../types";
  
  import {
    costCodeRepository,
  } from "../repository";
  
  interface CostCodeContextType {
  
    costCodes: CostCodeRecord[];
  
    refresh(): void;
  
    create(
      record: CostCodeRecord
    ): void;
  
    update(
      record: CostCodeRecord
    ): void;
  
    softDelete(
      id: string
    ): void;
  
  }
  
  const CostCodeContext =
    createContext<
      CostCodeContextType | null
    >(null);
  
  export function CostCodeProvider({
    children,
  }: {
    children: ReactNode;
  }) {
  
    const [
      version,
      setVersion,
    ] = useState(0);
  
    const costCodes =
      useMemo(
  
        () =>
          costCodeRepository.getAll(),
  
        [version]
  
      );
  
    function refresh() {
      setVersion(
        value => value + 1
      );
    }
  
    function create(
      record: CostCodeRecord
    ) {
  
      costCodeRepository.create(
        record
      );
  
      refresh();
  
    }
  
    function update(
      record: CostCodeRecord
    ) {
  
      costCodeRepository.update(
        record
      );
  
      refresh();
  
    }
  
    function softDelete(
      id: string
    ) {
  
      costCodeRepository.softDelete(
        id
      );
  
      refresh();
  
    }
  
    return (
  
      <CostCodeContext.Provider
        value={{
          costCodes,
          refresh,
          create,
          update,
          softDelete,
        }}
      >
        {children}
      </CostCodeContext.Provider>
  
    );
  
  }
  
  export function useCostCodeContext() {
  
    const context =
      useContext(
        CostCodeContext
      );
  
    if (!context) {
  
      throw new Error(
        "useCostCodeContext must be used inside CostCodeProvider."
      );
  
    }
  
    return context;
  
  }