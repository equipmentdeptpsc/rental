import {
  createContext,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import type { EquipmentRecord } from "../types";
import { equipmentRepository } from "../repository";

interface EquipmentContextType {
  equipment: EquipmentRecord[];

  addEquipment(
    equipment: EquipmentRecord
  ): void;

  updateEquipment(
    equipment: EquipmentRecord
  ): void;

  deleteEquipment(
    id: string
  ): void;

  getEquipment(
    id: string
  ): EquipmentRecord | undefined;

  updateStatus(
    id: string,
    status: EquipmentRecord["status"]
  ): void;
}

const EquipmentContext =
  createContext<
    EquipmentContextType | undefined
  >(undefined);

export function EquipmentProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [equipment, setEquipment] =
    useState(
      equipmentRepository.getAll()
    );

  function refresh() {
    setEquipment(
      equipmentRepository.getAll()
    );
  }

  function addEquipment(
    item: EquipmentRecord
  ) {
    equipmentRepository.create(item);
    refresh();
  }

  function updateEquipment(
    item: EquipmentRecord
  ) {
    equipmentRepository.update(item);
    refresh();
  }

  function deleteEquipment(
    id: string
  ) {
    equipmentRepository.delete(id);
    refresh();
  }

  function getEquipment(
    id: string
  ) {
    return equipment.find(
      (e) => e.id === id
    );
  }

  function updateStatus(
    id: string,
    status: EquipmentRecord["status"]
  ) {
    const machine =
      equipmentRepository.getById(id);

    if (!machine) return;

    equipmentRepository.update({
      ...machine,
      status,
    });

    refresh();
  }

  const value = useMemo(
    () => ({
      equipment,
      addEquipment,
      updateEquipment,
      deleteEquipment,
      getEquipment,
      updateStatus,
    }),
    [equipment]
  );

  return (
    <EquipmentContext.Provider
      value={value}
    >
      {children}
    </EquipmentContext.Provider>
  );
}

export function useEquipment() {
  const context =
    useContext(EquipmentContext);

  if (!context) {
    throw new Error(
      "useEquipment must be used inside EquipmentProvider"
    );
  }

  return context;
}