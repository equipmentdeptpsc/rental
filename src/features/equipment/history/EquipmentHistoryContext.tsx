import {
    createContext,
    useContext,
    useMemo,
    useState,
    type ReactNode,
  } from "react";
  
  import type {
    EquipmentHistoryRecord,
  } from "./types";
  
  interface EquipmentHistoryContextType {
    history: EquipmentHistoryRecord[];
  
    log(
      item: Omit<
        EquipmentHistoryRecord,
        "id" | "timestamp"
      >
    ): void;
  
    getHistory(
      equipmentId: string
    ): EquipmentHistoryRecord[];
  }
  
  const EquipmentHistoryContext =
    createContext<
      EquipmentHistoryContextType | undefined
    >(undefined);
  
  export function EquipmentHistoryProvider({
    children,
  }: {
    children: ReactNode;
  }) {
    const [history, setHistory] =
      useState<
        EquipmentHistoryRecord[]
      >([]);
  
    function log(
      item: Omit<
        EquipmentHistoryRecord,
        "id" | "timestamp"
      >
    ) {
      setHistory((prev) => [
        {
          ...item,
  
          id: crypto.randomUUID(),
  
          timestamp:
            new Date().toISOString(),
        },
  
        ...prev,
      ]);
    }
  
    function getHistory(
      equipmentId: string
    ) {
      return history.filter(
        (item) =>
          item.equipmentId ===
          equipmentId
      );
    }
  
    const value = useMemo(
      () => ({
        history,
  
        log,
  
        getHistory,
      }),
      [history]
    );
  
    return (
      <EquipmentHistoryContext.Provider
        value={value}
      >
        {children}
      </EquipmentHistoryContext.Provider>
    );
  }
  
  export function useEquipmentHistory() {
    const context =
      useContext(
        EquipmentHistoryContext
      );
  
    if (!context) {
      throw new Error(
        "useEquipmentHistory must be used inside EquipmentHistoryProvider"
      );
    }
  
    return context;
  }