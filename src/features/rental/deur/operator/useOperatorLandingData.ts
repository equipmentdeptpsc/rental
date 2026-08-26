import { useCallback, useEffect, useState } from "react";

import { useApplicationDependenciesCompatibility } from "@/app/composition";
import type { AssignmentRecord } from "@/features/assignment/types";
import type { EquipmentRecord } from "@/features/equipment/types";
import type { Operator } from "@/features/operators/types";
import type { ProjectRecord } from "@/features/project/types";
import type { RentalEquipmentLine } from "@/features/rental/equipment-line/types";
import type { RentalRecord } from "@/features/rental/types";
import type { DeurRecord } from "../types";

interface OperatorLandingData {
  assignments: AssignmentRecord[];
  equipment: EquipmentRecord[];
  operators: Operator[];
  projects: ProjectRecord[];
  rentals: RentalRecord[];
  rentalEquipmentLines: RentalEquipmentLine[];
  deurs: DeurRecord[];
  loading: boolean;
  error?: string;
}

const empty: OperatorLandingData = {
  assignments: [], equipment: [], operators: [], projects: [], rentals: [], rentalEquipmentLines: [], deurs: [], loading: true,
};

export function useOperatorLandingData(enabled = true) {
  const { readRepositories } = useApplicationDependenciesCompatibility();
  const [state, setState] = useState<OperatorLandingData>(empty);
  const refresh = useCallback(async () => {
    if (!enabled) return;
    setState((current) => ({ ...current, loading: true, error: undefined }));
    const [assignments, equipment, operators, projects, rentals, lines, deurs] = await Promise.all([
      readRepositories.assignments.list(), readRepositories.equipment.list(), readRepositories.operators.list(),
      readRepositories.projects.list(), readRepositories.rentals.list(), readRepositories.rentalEquipmentLines.list(),
      readRepositories.deurs.list(),
    ]);
    const results = [assignments, equipment, operators, projects, rentals, lines, deurs];
    const failed = results.find((result) => !result.success);
    if (failed && !failed.success) {
      setState({ ...empty, loading: false, error: failed.error.message });
      return;
    }
    setState({
      assignments: assignments.success ? assignments.value.items : [],
      equipment: equipment.success ? equipment.value.items : [],
      operators: operators.success ? operators.value.items : [],
      projects: projects.success ? projects.value.items : [],
      rentals: rentals.success ? rentals.value.items : [],
      rentalEquipmentLines: lines.success ? lines.value.items : [],
      deurs: deurs.success ? deurs.value.items : [],
      loading: false,
    });
  }, [enabled, readRepositories]);
  useEffect(() => { void refresh(); }, [refresh]);
  return { ...state, refresh };
}
