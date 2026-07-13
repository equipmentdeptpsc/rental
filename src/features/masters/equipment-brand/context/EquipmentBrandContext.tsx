import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

import type {
  EquipmentBrandRecord,
} from "../types";

import {
  equipmentBrandRepository,
} from "../repository/EquipmentBrandRepository";

interface EquipmentBrandContextType {
  records: EquipmentBrandRecord[];

  create(
    record: EquipmentBrandRecord
  ): void;

  update(
    record: EquipmentBrandRecord
  ): void;

  remove(
    id: string
  ): void;

  restore(
    id: string
  ): void;

  refresh(): void;
}

const EquipmentBrandContext =
  createContext<
    EquipmentBrandContextType | undefined
  >(undefined);

export function EquipmentBrandProvider({
  children,
}: {
  children: ReactNode;
}) {

  const [records, setRecords] =
    useState<
      EquipmentBrandRecord[]
    >([]);

  function refresh() {
    setRecords(
      equipmentBrandRepository.getAll()
    );
  }

  useEffect(() => {
    refresh();
  }, []);

  function create(
    record: EquipmentBrandRecord
  ) {
    equipmentBrandRepository.create(
      record
    );

    refresh();
  }

  function update(
    record: EquipmentBrandRecord
  ) {
    equipmentBrandRepository.update(
      record
    );

    refresh();
  }

  function remove(id: string) {
    equipmentBrandRepository.softDelete(
      id
    );

    refresh();
  }

  function restore(id: string) {
    equipmentBrandRepository.restore(
      id
    );

    refresh();
  }

  return (
    <EquipmentBrandContext.Provider
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
    </EquipmentBrandContext.Provider>
  );
}

export function useEquipmentBrands() {

  const context = useContext(
    EquipmentBrandContext
  );

  if (!context) {
    throw new Error(
      "useEquipmentBrands must be used inside EquipmentBrandProvider."
    );
  }

  return context;
}