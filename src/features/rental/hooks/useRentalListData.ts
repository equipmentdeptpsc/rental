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
import { repositoryFailure, repositorySuccess, type Page, type RepositoryResult } from "@/core/persistence";
import type { ReadOnlyRepository } from "@/core/remote";

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
  unavailableCatalogs?: readonly ("equipment" | "assignments" | "operators" | "projects" | "customers" | "references")[];
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

export async function loadRentalListPages<T>(repository: ReadOnlyRepository<T>): Promise<RepositoryResult<Page<T>>> {
  const items: T[] = [];
  let offset = 0;
  for (let page = 0; page < 100; page += 1) {
    const result = await repository.list({ paging: { offset, limit: 500 } });
    if (!result.success) return result;
    items.push(...result.value.items);
    if (!result.value.nextCursor) return repositorySuccess({ items, nextCursor: undefined });
    offset = Number(result.value.nextCursor);
    if (!Number.isSafeInteger(offset) || offset <= items.length - result.value.items.length) break;
  }
  return repositoryFailure("REPOSITORY_UNAVAILABLE", "Rental list exceeds the supported read window. Narrow the source data or contact support.");
}

export function useRentalListData(fallback: RentalListData, listOnly = false): RentalListLoadState {
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
      loadRentalListPages(readRepositories.rentals),
      loadRentalListPages(readRepositories.rentalEquipmentLines),
      loadRentalListPages(readRepositories.equipment).catch(() => repositoryFailure("REPOSITORY_UNAVAILABLE", "Equipment catalog unavailable.")),
      loadRentalListPages(readRepositories.assignments).catch(() => repositoryFailure("REPOSITORY_UNAVAILABLE", "Assignment catalog unavailable.")),
      loadRentalListPages(readRepositories.operators).catch(() => repositoryFailure("REPOSITORY_UNAVAILABLE", "Operator catalog unavailable.")),
      loadRentalListPages(readRepositories.projects).catch(() => repositoryFailure("REPOSITORY_UNAVAILABLE", "Project catalog unavailable.")),
      loadRentalListPages(readRepositories.customers).catch(() => repositoryFailure("REPOSITORY_UNAVAILABLE", "Customer catalog unavailable.")),
      commandRepositories.canonicalRental?.readReferenceData().catch(() => undefined),
    ]).then(([rentals, lines, equipment, assignments, operators, projects, customers, references]) => {
      if (!active) return;
      if (!rentals.success || !lines.success || (!listOnly && (!equipment.success
        || !assignments.success || !operators.success || !projects.success || !customers.success || !references?.success))) {
        setState({ status: "error", data: emptyRemoteData(), message: "Rental data could not be loaded. Retry the request or contact support." });
        return;
      }
      const unavailableCatalogs = ([
        !equipment.success && "equipment", !assignments.success && "assignments", !operators.success && "operators",
        !projects.success && "projects", !customers.success && "customers", !references?.success && "references",
      ].filter(Boolean) as NonNullable<RentalListData["unavailableCatalogs"]>);
      if (listOnly && unavailableCatalogs.length && import.meta.env.VITE_UAT_REMOTE_READ_DIAGNOSTICS === "true") {
        console.warn("Rental supporting reads unavailable", unavailableCatalogs);
      }
      setState({ status: "loaded", data: {
        rentals: rentals.value.items,
        rentalEquipmentLines: lines.value.items,
        equipment: equipment.success ? equipment.value.items : [],
        assignments: assignments.success ? assignments.value.items : [],
        operators: operators.success ? operators.value.items : [],
        projects: projects.success ? projects.value.items : [],
        customers: customers.success ? customers.value.items : [],
        costCodes: references?.success ? references.value.costCodes : [],
        activityCodes: references?.success ? references.value.activityCodes : [],
        unavailableCatalogs: listOnly ? unavailableCatalogs : [],
      } });
    }).catch(() => {
      if (active) setState({ status: "error", data: emptyRemoteData(), message: "Rental data could not be loaded. Retry the request or contact support." });
    });
    return () => { active = false; };
  }, [attempt, commandRepositories.canonicalRental, readRepositories, remote, listOnly]);

  return { ...state, retry } as RentalListLoadState;
}
