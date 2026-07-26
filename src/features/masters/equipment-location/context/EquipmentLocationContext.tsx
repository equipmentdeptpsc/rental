import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

import type {
  EquipmentLocationRecord,
} from "../types";

import {
  equipmentLocationRepository,
} from "../repository/EquipmentLocationRepository";

interface EquipmentLocationContextType {
  records: EquipmentLocationRecord[];

  create(
    record: EquipmentLocationRecord
  ): void;

  update(
    record: EquipmentLocationRecord
  ): void;

  remove(
    id: string
  ): void;

  restore(
    id: string
  ): void;

  refresh(): void;
}

const EquipmentLocationContext =
  createContext<
    EquipmentLocationContextType | undefined
  >(undefined);

export function EquipmentLocationProvider({
  children,
}: {
  children: ReactNode;
}) {

  const [records, setRecords] =
    useState<
      EquipmentLocationRecord[]
    >(() => equipmentLocationRepository.getAll());

  function refresh() {
    setRecords(
      equipmentLocationRepository.getAll()
    );
  }

  useEffect(() => {
    refresh();
  }, []);

  function create(
    record: EquipmentLocationRecord
  ) {
    equipmentLocationRepository.create(
      record
    );

    refresh();
  }

  function update(
    record: EquipmentLocationRecord
  ) {
    equipmentLocationRepository.update(
      record
    );

    refresh();
  }

  function remove(
    id: string
  ) {
    equipmentLocationRepository.softDelete(
      id
    );

    refresh();
  }

  function restore(
    id: string
  ) {
    equipmentLocationRepository.restore(
      id
    );

    refresh();
  }

  return (
    <EquipmentLocationContext.Provider
      value={{
        records,
        create,
        update,
        remove,
        restore,
        refresh,
      }}
    >
      {children}
    </EquipmentLocationContext.Provider>
  );
}

export function useEquipmentLocations() {

  const context =
    useContext(
      EquipmentLocationContext
    );

  if (!context) {
    throw new Error(
      "useEquipmentLocations must be used inside EquipmentLocationProvider."
    );
  }

  return context;
}
