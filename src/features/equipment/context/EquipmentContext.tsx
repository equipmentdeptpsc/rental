import {
  createContext,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import type {
  EquipmentRecord,
} from "../types";

import { guardEquipmentDeletion } from "@/features/relationships/deletionGuards";
import { useApplicationDependenciesCompatibility } from "@/app/composition";
import { createEquipmentWithCategoryAssetNumber } from "../services/categoryAssetNumber";
import { useOptionalAuth } from "@/features/auth/AuthContext";
import { AuthorizationError } from "@/features/auth/services/AuthorizationError";

interface EquipmentContextType {
  equipment: EquipmentRecord[];

  addEquipment(
    equipment: EquipmentRecord
  ): { success: boolean; message?: string; record?: EquipmentRecord };

  updateEquipment(
    equipment: EquipmentRecord
  ): void;

  deleteEquipment(
    id: string
  ): void;

  restoreEquipment(
    id: string
  ): void;

  permanentlyDeleteEquipment(
    id: string
  ): { success: boolean; message?: string };

  getDeletedEquipment():
    EquipmentRecord[];

  getEquipment(
    id: string
  ):
    | EquipmentRecord
    | undefined;

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
  const { equipment: equipmentRepository, prefix: prefixRepository } = useApplicationDependenciesCompatibility().repositories;
  const auth = useOptionalAuth();
  const authorize = (permission: "equipment.create" | "equipment.update" | "equipment.delete" | "equipment.restore") => {
    if (auth && !auth.hasPermission(permission)) throw new AuthorizationError(permission);
  };
  const [
    equipment,
    setEquipment,
  ] = useState(
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
    authorize("equipment.create");
    const prepared = createEquipmentWithCategoryAssetNumber({ ...item, assetNo: "" }, prefixRepository.getAll(), equipmentRepository.getAll());
    if (!prepared.success) return { success: false, message: prepared.message };
    equipmentRepository.create(prepared.record);
    refresh();
    return { success: true, record: prepared.record };
  }

  function updateEquipment(
    item: EquipmentRecord
  ) {
    authorize("equipment.update");
    equipmentRepository.update(item);
    refresh();
  }

  function deleteEquipment(
    id: string
  ) {
    authorize("equipment.delete");
    equipmentRepository.delete(id);
    refresh();
  }

  function restoreEquipment(
    id: string
  ) {
    authorize("equipment.restore");
    equipmentRepository.restore(id);
    refresh();
  }

  function permanentlyDeleteEquipment(
    id: string
  ) {
    authorize("equipment.delete");
    const result = guardEquipmentDeletion(id);

    if (!result.success) return result;

    equipmentRepository.permanentlyDelete(
      id
    );
    refresh();

    return result;
  }

  function getDeletedEquipment() {
    return equipmentRepository.getDeleted();
  }

  function getEquipment(
    id: string
  ) {
    return equipmentRepository.getById(
      id
    );
  }

  function updateStatus(
    id: string,
    status: EquipmentRecord["status"]
  ) {
    authorize("equipment.update");
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

      restoreEquipment,

      permanentlyDeleteEquipment,

      getDeletedEquipment,

      getEquipment,

      updateStatus,
    }),
    [auth, equipment]
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
    useContext(
      EquipmentContext
    );

  if (!context) {
    throw new Error(
      "useEquipment must be used inside EquipmentProvider"
    );
  }

  return context;
}
