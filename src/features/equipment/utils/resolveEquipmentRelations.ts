import type { EquipmentRecord } from "../types";

import type { ProjectRecord } from "@/features/project/types";
import type { Operator } from "@/features/operators/types";

export interface EquipmentView
  extends EquipmentRecord {
  projectName: string;
  operatorName: string;
}

export function resolveEquipmentRelations(
  equipment: EquipmentRecord[],
  projects: ProjectRecord[],
  operators: Operator[]
): EquipmentView[] {
  return equipment.map((item) => {
    const project = projects.find(
      (p) => p.id === item.projectId
    );

    const operator = operators.find(
      (o) => o.id === item.operatorId
    );

    return {
      ...item,

      projectName:
        project?.projectName ?? "-",

      operatorName:
        operator?.name ?? "-",
    };
  });
}