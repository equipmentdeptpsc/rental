import {
    createContext,
    useContext,
    useMemo,
    useState,
    type ReactNode,
  } from "react";
  
  import type {
    EquipmentTypeRecord,
  } from "../types";
  
  import {
    equipmentTypeRepository,
  } from "../repository";
  
  interface EquipmentTypeContextType {
  
    records: EquipmentTypeRecord[];
  
    refresh(): void;
  
    create(
      record: EquipmentTypeRecord,
    ): void;
  
    update(
      record: EquipmentTypeRecord,
    ): void;
  
    softDelete(
      id: string,
    ): void;
  
    restore(
      id: string,
    ): void;
  
  }
  
  const EquipmentTypeContext =
    createContext<EquipmentTypeContextType>(
      {} as EquipmentTypeContextType,
    );
  
  export function EquipmentTypeProvider({
  
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
  
          equipmentTypeRepository.getAll(),
  
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
  
      <EquipmentTypeContext.Provider
  
        value={{
  
          records,
  
          refresh,
  
          create(record) {
  
            equipmentTypeRepository.create(
              record,
            );
  
            refresh();
  
          },
  
          update(record) {
  
            equipmentTypeRepository.update(
              record,
            );
  
            refresh();
  
          },
  
          softDelete(id) {
  
            equipmentTypeRepository.softDelete(
              id,
            );
  
            refresh();
  
          },
  
          restore(id) {
  
            equipmentTypeRepository.restore(
              id,
            );
  
            refresh();
  
          },
  
        }}
  
      >
  
        {children}
  
      </EquipmentTypeContext.Provider>
  
    );
  
  }
  
  export function useEquipmentTypes() {
  
    return useContext(
  
      EquipmentTypeContext,
  
    );
  
  }