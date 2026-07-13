import {
    createContext,
    useContext,
    useMemo,
    useState,
    type ReactNode,
  } from "react";
  
  import type {
    EquipmentModelRecord,
  } from "../types";
  
  import {
    equipmentModelRepository,
  } from "../repository";
  
  interface EquipmentModelContextType {
  
    records: EquipmentModelRecord[];
  
    refresh(): void;
  
    create(
      record: EquipmentModelRecord,
    ): void;
  
    update(
      record: EquipmentModelRecord,
    ): void;
  
    softDelete(
      id: string,
    ): void;
  
    restore(
      id: string,
    ): void;
  
  }
  
  const EquipmentModelContext =
    createContext<EquipmentModelContextType>(
      {} as EquipmentModelContextType,
    );
  
  export function EquipmentModelProvider({
  
    children,
  
  }: {
  
    children: ReactNode;
  
  }) {
  
    const [
  
      version,
  
      setVersion,
  
    ] = useState(0);
  
    const records =
      useMemo(
  
        () =>
  
          equipmentModelRepository.getAll(),
  
        [
  
          version,
  
        ],
  
      );
  
    function refresh() {
  
      setVersion(
  
        value => value + 1,
  
      );
  
    }
  
    return (
  
      <EquipmentModelContext.Provider
  
        value={{
  
          records,
  
          refresh,
  
          create(record) {
  
            equipmentModelRepository.create(
  
              record,
  
            );
  
            refresh();
  
          },
  
          update(record) {
  
            equipmentModelRepository.update(
  
              record,
  
            );
  
            refresh();
  
          },
  
          softDelete(id) {
  
            equipmentModelRepository.softDelete(
  
              id,
  
            );
  
            refresh();
  
          },
  
          restore(id) {
  
            equipmentModelRepository.restore(
  
              id,
  
            );
  
            refresh();
  
          },
  
        }}
  
      >
  
        {children}
  
      </EquipmentModelContext.Provider>
  
    );
  
  }
  
  export function useEquipmentModels() {
  
    return useContext(
  
      EquipmentModelContext,
  
    );
  
  }