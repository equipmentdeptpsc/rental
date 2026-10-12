import { useEffect, useState } from "react";

import { useApplicationDependenciesCompatibility } from "@/app/composition";
import type { AssignmentRecord } from "@/features/assignment/types";
import { subscribeCanonicalAssignmentRefresh } from "@/features/assignment/remote/canonicalAssignmentRefresh";
import { loadAllAuthorizedPages } from "@/core/remote/loadAllAuthorizedPages";
import { repositorySuccess } from "@/core/persistence";
import { useAuth } from "@/features/auth/AuthContext";

export interface CanonicalAssignmentEquipment {
  id: string;
  assetNo: string;
  legacyEquipmentNumber?: string;
  equipmentName: string;
  statusId?: string;
  active: boolean;
  deleted: boolean;
}

export interface CanonicalAssignmentOperator {
  id: string;
  name: string;
  status: string;
  deleted: boolean;
}

export interface CanonicalAssignmentProject {
  id: string;
  projectCode?: string;
  name: string;
  active: boolean;
  customerId?: string;
}

export interface CanonicalAssignmentCustomer { id: string; name: string; active: boolean }

export interface CanonicalAssignmentData {
  assignments: AssignmentRecord[];
  equipment: CanonicalAssignmentEquipment[];
  operators: CanonicalAssignmentOperator[];
  projects: CanonicalAssignmentProject[];
  customers: CanonicalAssignmentCustomer[];
}

export type CanonicalAssignmentLoadState =
  | { status: "loading"; data: CanonicalAssignmentData; retry(): void }
  | { status: "loaded" | "empty"; data: CanonicalAssignmentData; retry(): void }
  | { status: "error"; data: CanonicalAssignmentData; message: string; retry(): void };

type CanonicalAssignmentInternalState =
  | { status: "loading" | "loaded" | "empty"; data: CanonicalAssignmentData }
  | { status: "error"; data: CanonicalAssignmentData; message: string };

const emptyData = (): CanonicalAssignmentData => ({ assignments: [], equipment: [], operators: [], projects: [], customers: [] });
const text = (value: unknown) => typeof value === "string" ? value : "";

export function useCanonicalAssignmentData(): CanonicalAssignmentLoadState {
  const { readRepositories } = useApplicationDependenciesCompatibility();
  const { hasPermission } = useAuth();
  const canReadCustomers = hasPermission("customer.read");
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<CanonicalAssignmentInternalState>({ status: "loading", data: emptyData() });
  const retry = () => setAttempt((value) => value + 1);

  useEffect(() => {
    return subscribeCanonicalAssignmentRefresh(retry);
  }, []);

  useEffect(() => {
    let active = true;
    setState({ status: "loading", data: emptyData() });
    void Promise.all([
      loadAllAuthorizedPages(readRepositories.assignments),
      loadAllAuthorizedPages(readRepositories.equipment),
      loadAllAuthorizedPages(readRepositories.operators),
      loadAllAuthorizedPages(readRepositories.projects),
      canReadCustomers ? loadAllAuthorizedPages(readRepositories.customers) : Promise.resolve(repositorySuccess([])),
    ]).then(([assignments, equipment, operators, projects, customers]) => {
      if (!active) return;
      if (!assignments.success || !equipment.success || !operators.success || !projects.success || !customers.success) {
        setState({ status: "error", data: emptyData(), message: "Canonical Assignment data could not be loaded. Retry the request or contact support." });
        return;
      }
      const data: CanonicalAssignmentData = {
        assignments: assignments.value,
        equipment: equipment.value.map((record) => {
          const canonical = record as unknown as Record<string, unknown>;
          return { id: record.id, assetNo: record.assetNo, legacyEquipmentNumber: text(canonical.legacyEquipmentNumber) || undefined, equipmentName: record.equipmentName, statusId: text(canonical.statusId) || undefined, active: canonical.active === true, deleted: canonical.deletedAt !== null && canonical.deletedAt !== undefined };
        }),
        operators: operators.value.map((record) => {
          const canonical = record as unknown as Record<string, unknown>;
          return { id: record.id, name: record.name, status: record.status, deleted: canonical.deletedAt !== null && canonical.deletedAt !== undefined };
        }),
        projects: projects.value.map((record) => ({
          id: record.id, projectCode: record.projectCode || undefined, name: record.projectName,
          active: record.status === "Active" && record.deleted !== true, customerId: record.customerId,
        })),
        customers: customers.value.map((record) => ({ id: record.id, name: record.companyName, active: record.active !== false })),
      };
      setState({ status: data.assignments.length ? "loaded" : "empty", data });
    }).catch(() => {
      if (active) setState({ status: "error", data: emptyData(), message: "Canonical Assignment data could not be loaded. Retry the request or contact support." });
    });
    return () => { active = false; };
  }, [attempt, canReadCustomers, readRepositories]);

  return { ...state, retry } as CanonicalAssignmentLoadState;
}
