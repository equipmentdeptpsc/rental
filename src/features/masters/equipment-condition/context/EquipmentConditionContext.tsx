import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

import type {
  EquipmentConditionRecord,
} from "../types";

import {
  equipmentConditionRepository,
} from "../repository/EquipmentConditionRepository";

interface EquipmentConditionContextType {
  records: EquipmentConditionRecord[];

  create(
    record: EquipmentConditionRecord
  ): void;

  update(
    record: EquipmentConditionRecord
  ): void;

  remove(
    id: string
  ): void;

  restore(
    id: string
  ): void;

  refresh(): void;
}

const EquipmentConditionContext =
  createContext<
    EquipmentConditionContextType | undefined
  >(undefined);

export function EquipmentConditionProvider({
  children,
}: {
  children: ReactNode;
}) {

  const [records, setRecords] =
    useState<
      EquipmentConditionRecord[]
    >([]);

  function refresh() {
    setRecords(
      equipmentConditionRepository.getAll()
    );
  }

  useEffect(() => {
    refresh();
  }, []);

  function create(
    record: EquipmentConditionRecord
  ) {
    equipmentConditionRepository.create(
      record
    );

    refresh();
  }

  function update(
    record: EquipmentConditionRecord
  ) {
    equipmentConditionRepository.update(
      record
    );

    refresh();
  }

  function remove(
    id: string
  ) {
    equipmentConditionRepository.softDelete(
      id
    );

    refresh();
  }

  function restore(
    id: string
  ) {
    equipmentConditionRepository.restore(
      id
    );

    refresh();
  }

  return (
    <EquipmentConditionContext.Provider
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
    </EquipmentConditionContext.Provider>
  );
}

export function useEquipmentConditions() {

  const context =
    useContext(
      EquipmentConditionContext
    );

  if (!context) {
    throw new Error(
      "useEquipmentConditions must be used inside EquipmentConditionProvider."
    );
  }

  return context;
}