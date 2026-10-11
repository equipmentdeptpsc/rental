import { useEffect, useState } from "react";

import { useApplicationDependenciesCompatibility } from "@/app/composition";
import type { AssignmentRecord } from "@/features/assignment/types";
import type { EquipmentRecord } from "@/features/equipment/types";
import type { Operator } from "@/features/operators/types";
import type { ProjectRecord } from "@/features/project/types";
import type { CustomerRecord } from "@/features/customer/types";
import type { RentalEquipmentLine } from "@/features/rental/equipment-line/types";
import type { RentalRecord } from "@/features/rental/types";
import { subscribeCanonicalRentalRefresh } from "@/features/rental/remote/canonicalRentalRefresh";
import type { CanonicalReferenceCode } from "@/features/rental/remote/contracts";
import { loadAllAuthorizedPages } from "@/core/remote/loadAllAuthorizedPages";

export interface RentalListData {
  rentals: RentalRecord[];
  rentalEquipmentLines: RentalEquipmentLine[];
  equipment: EquipmentRecord[];
  assignments: AssignmentRecord[];
  operators: Operator[];
  projects: ProjectRecord[];
  customers: CustomerRecord[];
  costCodes: CanonicalReferenceCode[];
  activityCodes: CanonicalReferenceCode[];
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
  rentals: [], rentalEquipmentLines: [], equipment: [], assignments: [], operators: [], projects: [], customers: [], costCodes: [], activityCodes: [],
});

export function useRentalListData(fallback: RentalListData): RentalListLoadState {
  const { readRepositories, commandRepositories, configuration } = useApplicationDependenciesCompatibility();
  const remote = configuration.persistenceMode === "remote";
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<RentalListInternalState>(() =>
    remote ? { status: "loading", data: emptyRemoteData() } : { status: "loaded", data: fallback },
  );
  const retry = () => setAttempt((value) => value + 1);

  useEffect(() => subscribeCanonicalRentalRefresh(retry), []);

  useEffect(() => {
    if (remote) return;
    setState({ status: "loaded", data: fallback });
  }, [fallback, remote]);

  useEffect(() => {
    if (!remote) return;
    setState({ status: "loading", data: emptyRemoteData() });
    let active = true;
    void Promise.all([
      loadAllAuthorizedPages(readRepositories.rentals),
      loadAllAuthorizedPages(readRepositories.rentalEquipmentLines),
      loadAllAuthorizedPages(readRepositories.equipment),
      loadAllAuthorizedPages(readRepositories.assignments),
      loadAllAuthorizedPages(readRepositories.operators),
      loadAllAuthorizedPages(readRepositories.projects),
      loadAllAuthorizedPages(readRepositories.customers),
      commandRepositories.canonicalRental?.readReferenceData(),
    ]).then(([rentals, lines, equipment, assignments, operators, projects, customers, references]) => {
      if (!active) return;
      if (!rentals.success || !lines.success || !equipment.success
        || !assignments.success || !operators.success || !projects.success || !customers.success || !references?.success) {
        setState({ status: "error", data: emptyRemoteData(), message: "Canonical Rental data could not be loaded. Retry the request or contact support." });
        return;
      }
      setState({ status: "loaded", data: {
        rentals: rentals.value,
        rentalEquipmentLines: lines.value,
        equipment: equipment.value,
        assignments: assignments.value,
        operators: operators.value,
        projects: projects.value,
        customers: customers.value,
        costCodes: references.value.costCodes,
        activityCodes: references.value.activityCodes,
      } });
    }).catch(() => {
      if (active) setState({ status: "error", data: emptyRemoteData(), message: "Canonical Rental data could not be loaded. Retry the request or contact support." });
    });
    return () => { active = false; };
  }, [attempt, commandRepositories.canonicalRental, readRepositories, remote]);

  return { ...state, retry } as RentalListLoadState;
}
