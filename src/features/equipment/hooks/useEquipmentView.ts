import { useMemo } from "react";

import { useEquipment } from "../context/EquipmentContext";

import { useProject } from "@/features/project/context/ProjectContext";
import { useOperator } from "@/features/operators/context/OperatorContext";

import { resolveEquipmentRelations } from "../utils/resolveEquipmentRelations";

export function useEquipmentView() {
  const { equipment } = useEquipment();

  const { projects } = useProject();

  const { operators } = useOperator();

  return useMemo(
    () =>
      resolveEquipmentRelations(
        equipment,
        projects,
        operators
      ),
    [
      equipment,
      projects,
      operators,
    ]
  );
}