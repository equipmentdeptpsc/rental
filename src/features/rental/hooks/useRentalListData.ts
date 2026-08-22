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

export type RentalListLoadState =
  | { status: "loading"; data: RentalListData; retry(): void }
  | { status: "loaded"; data: RentalListData; retry(): void }
  | { status: "error"; data: RentalListData; message: string; retry(): void };

type RentalListInternalState =
  | { status: "loading"; data: RentalListData }
  | { status: "loaded"; data: RentalListData }
  | { status: "error"; data: RentalListData; message: string };

const emptyRemoteData = (): RentalListData => ({
  rentals: [], rentalEquipmentLines: [], equipment: [], assignments: [], operators: [], projects: [],
});

export function useRentalListData(fallback: RentalListData): RentalListLoadState {
  const { readRepositories, configuration } = useApplicationDependenciesCompatibility();
  const remote = configuration.persistenceMode === "remote";
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<RentalListInternalState>(() =>
    remote ? { status: "loading", data: emptyRemoteData() } : { status: "loaded", data: fallback },
  );
  const retry = () => setAttempt((value) => value + 1);

  useEffect(() => {
    if (!remote) {
      setState({ status: "loaded", data: fallback });
      return;
    }
    setState({ status: "loading", data: emptyRemoteData() });
    let active = true;
    void Promise.all([
      readRepositories.rentals.list(),
      readRepositories.rentalEquipmentLines.list(),
      readRepositories.equipment.list(),
      readRepositories.assignments.list(),
      readRepositories.operators.list(),
      readRepositories.projects.list(),
    ]).then(([rentals, lines, equipment, assignments, operators, projects]) => {
      if (!active) return;
      if (!rentals.success || !lines.success || !equipment.success
        || !assignments.success || !operators.success || !projects.success) {
        setState({ status: "error", data: emptyRemoteData(), message: "Canonical Rental data could not be loaded. Retry the request or contact support." });
        return;
      }
      setState({ status: "loaded", data: {
        rentals: rentals.value.items,
        rentalEquipmentLines: lines.value.items,
        equipment: equipment.value.items,
        assignments: assignments.value.items,
        operators: operators.value.items,
        projects: projects.value.items,
      } });
    }).catch(() => {
      if (active) setState({ status: "error", data: emptyRemoteData(), message: "Canonical Rental data could not be loaded. Retry the request or contact support." });
    });
    return () => { active = false; };
  }, [attempt, fallback, readRepositories, remote]);

  return { ...state, retry } as RentalListLoadState;
}
