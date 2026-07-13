import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

import type {
  EquipmentStatusRecord,
} from "../types";

import {
  equipmentStatusRepository,
} from "../repository/EquipmentStatusRepository";

interface EquipmentStatusContextType {
  records: EquipmentStatusRecord[];

  create(
    record: EquipmentStatusRecord
  ): void;

  update(
    record: EquipmentStatusRecord
  ): void;

  remove(
    id: string
  ): void;

  restore(
    id: string
  ): void;

  refresh(): void;
}

const EquipmentStatusContext =
  createContext<
    EquipmentStatusContextType | undefined
  >(undefined);

export function EquipmentStatusProvider({
  children,
}: {
  children: ReactNode;
}) {

  const [records, setRecords] =
    useState<
      EquipmentStatusRecord[]
    >([]);

  function refresh() {
    setRecords(
      equipmentStatusRepository.getAll()
    );
  }

  useEffect(() => {
    refresh();
  }, []);

  function create(
    record: EquipmentStatusRecord
  ) {
    equipmentStatusRepository.create(
      record
    );

    refresh();
  }

  function update(
    record: EquipmentStatusRecord
  ) {
    equipmentStatusRepository.update(
      record
    );

    refresh();
  }

  function remove(
    id: string
  ) {
    equipmentStatusRepository.softDelete(
      id
    );

    refresh();
  }

  function restore(
    id: string
  ) {
    equipmentStatusRepository.restore(
      id
    );

    refresh();
  }

  return (
    <EquipmentStatusContext.Provider
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
    </EquipmentStatusContext.Provider>
  );
}

export function useEquipmentStatuses() {

  const context =
    useContext(
      EquipmentStatusContext
    );

  if (!context) {
    throw new Error(
      "useEquipmentStatuses must be used inside EquipmentStatusProvider."
    );
  }

  return context;
}