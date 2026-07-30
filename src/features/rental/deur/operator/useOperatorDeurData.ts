import { useCallback, useEffect, useState } from "react";
import { useApplicationDependenciesCompatibility } from "@/app/composition";
import type { User } from "@/features/auth/domain/user";
import type { RentalRecord } from "@/features/rental/types";
import type { RentalEquipmentLine } from "@/features/rental/equipment-line/types";
import type { AssignmentRecord } from "@/features/assignment/types";
import type { Operator } from "@/features/operators/types";
import type { EquipmentRecord } from "@/features/equipment/types";
import type { ProjectRecord } from "@/features/project/types";
import type { DeurRecord } from "../types";
import type { WorkDescriptionRecord } from "@/features/masters/work-description/types";

interface OperatorDeurData {
  rental?: RentalRecord; lines: RentalEquipmentLine[]; assignments: AssignmentRecord[]; operators: Operator[];
  equipment: EquipmentRecord[]; projects: ProjectRecord[]; deurs: DeurRecord[]; workDescriptions: WorkDescriptionRecord[]; loading: boolean; error?: string;
}
const empty: OperatorDeurData = { lines: [], assignments: [], operators: [], equipment: [], projects: [], deurs: [], workDescriptions: [], loading: true };

export function useOperatorDeurData(rentalId: string, user?: User | null) {
  const { readRepositories } = useApplicationDependenciesCompatibility();
  const [state, setState] = useState<OperatorDeurData>(empty);
  const refresh = useCallback(async () => {
    setState((current) => ({ ...current, loading: true, error: undefined }));
    const [rental, lines, assignments, operators, equipment, projects, deurs, workDescriptions] = await Promise.all([
      readRepositories.rentals.getById(rentalId), readRepositories.rentalEquipmentLines.list(),
      readRepositories.assignments.list(), readRepositories.operators.list(), readRepositories.equipment.list(),
      readRepositories.projects.list(), readRepositories.deurs.list(), readRepositories.workDescriptions.list(),
    ]);
    const results = [rental, lines, assignments, operators, equipment, projects, deurs, workDescriptions];
    const failed = results.find((result) => !result.success);
    if (failed && !failed.success) { setState((current) => ({ ...current, loading: false, error: failed.error.message })); return; }
    const allLines = lines.success ? lines.value.items : [];
    const operatorLines = allLines.filter((line) => line.rentalId === rentalId && (!user?.operatorId || line.operatorId === user.operatorId));
    const lineIds = new Set(operatorLines.map((line) => line.id));
    setState({
      rental: rental.success ? rental.value ?? undefined : undefined,
      lines: operatorLines,
      assignments: assignments.success ? assignments.value.items.filter((item) => operatorLines.some((line) => line.assignmentId === item.id)) : [],
      operators: operators.success ? operators.value.items.filter((item) => item.id === user?.operatorId) : [],
      equipment: equipment.success ? equipment.value.items.filter((item) => operatorLines.some((line) => line.equipmentId === item.id)) : [],
      projects: projects.success ? projects.value.items : [],
      deurs: deurs.success ? deurs.value.items.filter((item) => item.rentalId === rentalId && (!item.rentalEquipmentLineId || lineIds.has(item.rentalEquipmentLineId))) : [],
      workDescriptions: workDescriptions.success ? workDescriptions.value.items : [],
      loading: false,
    });
  }, [readRepositories, rentalId, user?.operatorId]);
  useEffect(() => { void refresh(); }, [refresh]);
  return { ...state, refresh };
}
