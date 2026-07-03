import {
    createContext,
    useContext,
    useMemo,
    useState,
    type ReactNode,
  } from "react";
  
  import type { MaintenanceRecord } from "../types";
  
  import { maintenanceRepository } from "../repository";
  
  interface MaintenanceContextType {
    maintenance: MaintenanceRecord[];
  
    addMaintenance(
      item: MaintenanceRecord
    ): void;
  
    updateMaintenance(
      item: MaintenanceRecord
    ): void;
  
    deleteMaintenance(
      id: string
    ): void;
  }
  
  const MaintenanceContext =
    createContext<
      MaintenanceContextType | undefined
    >(undefined);
  
  export function MaintenanceProvider({
    children,
  }: {
    children: ReactNode;
  }) {
    const [maintenance, setMaintenance] =
      useState(
        maintenanceRepository.getAll()
      );
  
    function refresh() {
      setMaintenance(
        maintenanceRepository.getAll()
      );
    }
  
    function addMaintenance(
      item: MaintenanceRecord
    ) {
      maintenanceRepository.create(item);
      refresh();
    }
  
    function updateMaintenance(
      item: MaintenanceRecord
    ) {
      maintenanceRepository.update(item);
      refresh();
    }
  
    function deleteMaintenance(
      id: string
    ) {
      maintenanceRepository.delete(id);
      refresh();
    }
  
    const value = useMemo(
      () => ({
        maintenance,
        addMaintenance,
        updateMaintenance,
        deleteMaintenance,
      }),
      [maintenance]
    );
  
    return (
      <MaintenanceContext.Provider
        value={value}
      >
        {children}
      </MaintenanceContext.Provider>
    );
  }
  
  export function useMaintenance() {
    const context = useContext(
      MaintenanceContext
    );
  
    if (!context) {
      throw new Error(
        "useMaintenance must be used inside MaintenanceProvider"
      );
    }
  
    return context;
  }