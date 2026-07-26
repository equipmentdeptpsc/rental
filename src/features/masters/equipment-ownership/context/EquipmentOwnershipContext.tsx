import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

import type {
  EquipmentOwnershipRecord,
} from "../types";

import {
  equipmentOwnershipRepository,
} from "../repository/EquipmentOwnershipRepository";

interface EquipmentOwnershipContextType {
  records: EquipmentOwnershipRecord[];

  create(
    record: EquipmentOwnershipRecord
  ): void;

  update(
    record: EquipmentOwnershipRecord
  ): void;

  remove(
    id: string
  ): void;

  restore(
    id: string
  ): void;

  refresh(): void;
}

const EquipmentOwnershipContext =
  createContext<
    EquipmentOwnershipContextType | undefined
  >(undefined);

export function EquipmentOwnershipProvider({
  children,
}: {
  children: ReactNode;
}) {

  const [records, setRecords] =
    useState<
      EquipmentOwnershipRecord[]
    >(() => equipmentOwnershipRepository.getAll());

  function refresh() {
    setRecords(
      equipmentOwnershipRepository.getAll()
    );
  }

  useEffect(() => {
    refresh();
  }, []);

  function create(
    record: EquipmentOwnershipRecord
  ) {
    equipmentOwnershipRepository.create(
      record
    );

    refresh();
  }

  function update(
    record: EquipmentOwnershipRecord
  ) {
    equipmentOwnershipRepository.update(
      record
    );

    refresh();
  }

  function remove(
    id: string
  ) {
    equipmentOwnershipRepository.softDelete(
      id
    );

    refresh();
  }

  function restore(
    id: string
  ) {
    equipmentOwnershipRepository.restore(
      id
    );

    refresh();
  }

  return (
    <EquipmentOwnershipContext.Provider
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
    </EquipmentOwnershipContext.Provider>
  );
}

export function useEquipmentOwnerships() {

  const context =
    useContext(
      EquipmentOwnershipContext
    );

  if (!context) {
    throw new Error(
      "useEquipmentOwnerships must be used inside EquipmentOwnershipProvider."
    );
  }

  return context;
}
