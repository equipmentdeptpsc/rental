import { useEffect, useState } from "react";

import { useApplicationDependenciesCompatibility } from "@/app/composition";
import type { AssignmentRecord } from "@/features/assignment/types";
import type { EquipmentRecord } from "@/features/equipment/types";
import type { Operator } from "@/features/operators/types";
import type { ProjectRecord } from "@/features/project/types";
import type { RentalEquipmentLine } from "@/features/rental/equipment-line/types";
import type { RentalRecord } from "@/features/rental/types";

export interface RentalListData {
  rentals: RentalRecord[];
  rentalEquipmentLines: RentalEquipmentLine[];
  equipment: EquipmentRecord[];
  assignments: AssignmentRecord[];
  operators: Operator[];
  projects: ProjectRecord[];
}

export function useRentalListData(fallback: RentalListData): RentalListData {
  const { readRepositories, configuration } = useApplicationDependenciesCompatibility();
  const [data, setData] = useState(fallback);

  useEffect(() => {
    setData(fallback);
    if (configuration.persistenceMode !== "remote") return;
    let active = true;
    void Promise.all([
      readRepositories.rentals.list(),
      readRepositories.rentalEquipmentLines.list(),
      readRepositories.equipment.list(),
      readRepositories.assignments.list(),
      readRepositories.operators.list(),
      readRepositories.projects.list(),
    ]).then(([rentals, lines, equipment, assignments, operators, projects]) => {
      if (!active || !rentals.success || !lines.success || !equipment.success
        || !assignments.success || !operators.success || !projects.success) return;
      setData({
        rentals: rentals.value.items,
        rentalEquipmentLines: lines.value.items,
        equipment: equipment.value.items,
        assignments: assignments.value.items,
        operators: operators.value.items,
        projects: projects.value.items,
      });
    });
    return () => { active = false; };
  }, [configuration.persistenceMode, fallback, readRepositories]);

  return data;
}
