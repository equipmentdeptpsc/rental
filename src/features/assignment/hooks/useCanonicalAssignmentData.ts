import { useEffect, useState } from "react";

import { useApplicationDependenciesCompatibility } from "@/app/composition";
import type { AssignmentRecord } from "@/features/assignment/types";
import { subscribeCanonicalAssignmentRefresh } from "@/features/assignment/remote/canonicalAssignmentRefresh";
import { useAuth } from "@/features/auth/AuthContext";

export interface CanonicalAssignmentEquipment {
  id: string;
  assetNo: string;
  equipmentName: string;
  category?: string;
  condition?: string;
  location?: string;
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
  customerId?: string;
  location?: string;
  active: boolean;
}

export interface CanonicalAssignmentData {
  assignments: AssignmentRecord[];
  equipment: CanonicalAssignmentEquipment[];
  operators: CanonicalAssignmentOperator[];
  projects: CanonicalAssignmentProject[];
  customers: Array<{ id: string; name: string }>;
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
  const { hasPermission } = useAuth();
  const canReadCustomers = hasPermission("customer.read");
  const { readRepositories } = useApplicationDependenciesCompatibility();
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
      readRepositories.assignments.list(),
      readRepositories.equipment.list(),
      readRepositories.operators.list(),
      readRepositories.projects.list(),
      canReadCustomers ? readRepositories.customers.list() : Promise.resolve(null),
      readRepositories.equipmentCategories.list(),
    ]).then(([assignments, equipment, operators, projects, customers, categories]) => {
      if (!active) return;
      if (!assignments.success || !equipment.success || !operators.success || !projects.success) {
        setState({ status: "error", data: emptyData(), message: "Assignment data could not be loaded. Retry the request or contact support." });
        return;
      }
      const categoryNames = new Map(categories.success ? categories.value.items.map((item) => [item.id, item.name]) : []);
      const data: CanonicalAssignmentData = {
        assignments: assignments.value.items,
        equipment: equipment.value.items.map((record) => {
          const canonical = record as unknown as Record<string, unknown>;
          return { id: record.id, assetNo: record.assetNo, equipmentName: record.equipmentName, statusId: text(canonical.statusId) || undefined, category: categoryNames.get(text(canonical.categoryId)) || text(canonical.category), condition: text(canonical.condition), location: text(canonical.location), active: canonical.active === true, deleted: canonical.deletedAt !== null && canonical.deletedAt !== undefined };
        }),
        operators: operators.value.items.map((record) => {
          const canonical = record as unknown as Record<string, unknown>;
          return { id: record.id, name: record.name, status: record.status, deleted: canonical.deletedAt !== null && canonical.deletedAt !== undefined };
        }),
        projects: projects.value.items.map((record) => {
          const canonical = record as unknown as Record<string, unknown>;
          return { id: record.id, projectCode: text(canonical.projectCode) || undefined, name: record.projectName, customerId: text(canonical.customerId) || undefined, location: text(canonical.location) || undefined, active: canonical.active === true || canonical.status === "Active" };
        }),
        customers: customers?.success ? customers.value.items.map((item) => ({ id: item.id, name: item.companyName })) : [],
      };
      setState({ status: data.assignments.length ? "loaded" : "empty", data });
    }).catch(() => {
      if (active) setState({ status: "error", data: emptyData(), message: "Assignment data could not be loaded. Retry the request or contact support." });
    });
    return () => { active = false; };
  }, [attempt, canReadCustomers, readRepositories]);

  return { ...state, retry } as CanonicalAssignmentLoadState;
}
