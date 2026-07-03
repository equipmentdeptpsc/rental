import {
  createContext,
  useContext,
  useState,
} from "react";

import type { ReactNode } from "react";

import type { EquipmentRecord } from "../types";

import { equipmentRepository } from "../repository";

interface EquipmentContextType {
  equipment: EquipmentRecord[];

  addEquipment: (item: EquipmentRecord) => void;

  updateEquipment: (item: EquipmentRecord) => void;

  deleteEquipment: (id: string) => void;

  getEquipment: (id: string) => EquipmentRecord | undefined;
}

const EquipmentContext = createContext<
  EquipmentContextType | undefined
>(undefined);

export function EquipmentProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [equipment, setEquipment] = useState(
    equipmentRepository.getAll()
  );

  function refresh() {
    setEquipment(equipmentRepository.getAll());
  }

  function addEquipment(item: EquipmentRecord) {
    equipmentRepository.create(item);
    refresh();
  }

  function updateEquipment(item: EquipmentRecord) {
    equipmentRepository.update(item);
    refresh();
  }

  function deleteEquipment(id: string) {
    equipmentRepository.delete(id);
    refresh();
  }

  function getEquipment(id: string) {
    return equipmentRepository.getById(id);
  }

  return (
    <EquipmentContext.Provider
      value={{
        equipment,
        addEquipment,
        updateEquipment,
        deleteEquipment,
        getEquipment,
      }}
    >
      {children}
    </EquipmentContext.Provider>
  );
}

export function useEquipment() {
  const context = useContext(EquipmentContext);

  if (!context) {
    throw new Error(
      "useEquipment must be used within EquipmentProvider"
    );
  }

  return context;
}