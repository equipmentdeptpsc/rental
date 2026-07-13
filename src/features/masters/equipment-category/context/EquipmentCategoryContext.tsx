import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

import type {
  EquipmentCategoryRecord,
} from "../types";

import {
  equipmentCategoryRepository,
} from "../repository/EquipmentCategoryRepository";

interface EquipmentCategoryContextType {
  records: EquipmentCategoryRecord[];

  create(
    record: EquipmentCategoryRecord
  ): void;

  update(
    record: EquipmentCategoryRecord
  ): void;

  remove(
    id: string
  ): void;

  restore(
    id: string
  ): void;

  refresh(): void;
}

const EquipmentCategoryContext =
  createContext<
    EquipmentCategoryContextType | undefined
  >(undefined);

export function EquipmentCategoryProvider({
  children,
}: {
  children: ReactNode;
}) {

  const [records, setRecords] =
    useState<
      EquipmentCategoryRecord[]
    >([]);

  function refresh() {
    setRecords(
      equipmentCategoryRepository.getAll()
    );
  }

  useEffect(() => {
    refresh();
  }, []);

  function create(
    record: EquipmentCategoryRecord
  ) {
    equipmentCategoryRepository.create(
      record
    );

    refresh();
  }

  function update(
    record: EquipmentCategoryRecord
  ) {
    equipmentCategoryRepository.update(
      record
    );

    refresh();
  }

  function remove(id: string) {
    equipmentCategoryRepository.softDelete(
      id
    );

    refresh();
  }

  function restore(id: string) {
    equipmentCategoryRepository.restore(
      id
    );

    refresh();
  }

  return (
    <EquipmentCategoryContext.Provider
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
    </EquipmentCategoryContext.Provider>
  );
}

export function useEquipmentCategories() {

  const context = useContext(
    EquipmentCategoryContext
  );

  if (!context) {
    throw new Error(
      "useEquipmentCategories must be used inside EquipmentCategoryProvider."
    );
  }

  return context;
}