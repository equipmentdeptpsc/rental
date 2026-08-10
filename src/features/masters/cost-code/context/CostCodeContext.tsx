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
  import { useOptionalAuth } from "@/features/auth/AuthContext";
  import { AuthorizationError } from "@/features/auth/services/AuthorizationError";
  
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
    const auth = useOptionalAuth();
    const authorize = () => { if (auth && !auth.hasPermission("masterData.manage")) throw new AuthorizationError("masterData.manage"); };
  
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
      authorize();
  
      costCodeRepository.create(
        record
      );
  
      refresh();
  
    }
  
    function update(
      record: CostCodeRecord
    ) {
      authorize();
  
      costCodeRepository.update(
        record
      );
  
      refresh();
  
    }
  
    function softDelete(
      id: string
    ) {
      authorize();
  
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
