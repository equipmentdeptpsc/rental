import { useMemo } from "react";

import type { EquipmentRecord } from "@/features/equipment/types";

import {
  validateEquipmentAssignment,
} from "../utils/assignmentValidation";

export function useAssignmentValidation(
  equipment: EquipmentRecord | undefined
) {
  return useMemo(
    () =>
      validateEquipmentAssignment(
        equipment
      ),
    [equipment]
  );
}