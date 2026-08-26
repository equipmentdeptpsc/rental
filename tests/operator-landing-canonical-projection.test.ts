import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ApplicationDependencyContext } from "@/app/composition/dependencyContext";
import { PersistenceMode, type ApplicationDependencies } from "@/app/composition/ApplicationDependencies";
import OperatorLandingPage from "@/pages/OperatorLanding";

vi.mock("@/features/auth/AuthContext", () => ({
  useAuth: () => ({
    user: { id: "user-3", username: "uat.operator.003", displayName: "UAT Operator 003", name: "UAT Operator 003", status: "active", systemRoles: ["operator"], operatorId: "OP-003" },
    hasPermission: (permission: string) => permission === "deur.read",
  }),
}));
vi.mock("@/features/assignment/context/AssignmentContext", () => ({ useAssignment: () => ({ assignments: [] }) }));
vi.mock("@/features/equipment/context/EquipmentContext", () => ({ useEquipment: () => ({ equipment: [] }) }));
vi.mock("@/features/operators/context/OperatorContext", () => ({ useOperator: () => ({ operators: [] }) }));
vi.mock("@/features/project/context/ProjectContext", () => ({ useProject: () => ({ projects: [] }) }));
vi.mock("@/features/rental/context/RentalContext", () => ({ useRental: () => ({ rentals: [], rentalEquipmentLines: [] }) }));
vi.mock("@/features/rental/deur/synchronization/deurChangeNotifications", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/features/rental/deur/synchronization/deurChangeNotifications")>(),
  subscribeDeurChanges: () => () => undefined,
}));

const roots: Root[] = [];
const success = (items: unknown[]) => ({ success: true, value: { items } });
const repository = (items: unknown[]) => ({ list: vi.fn(async () => success(items)) });

function dependencies(): ApplicationDependencies {
  return {
    configuration: { persistenceMode: PersistenceMode.Remote, equipmentStatusSource: "supabase", remoteOperationalWritesEnabled: true },
    readRepositories: {
      assignments: repository([{ id: "ASN-000003", projectId: "PROJECT-3", equipmentId: "EQ-3", operatorId: "OP-003", status: "Active" }]),
      equipment: repository([{ id: "EQ-3", assetNo: "UAT-EQP-003", equipmentName: "UAT Equipment 003" }]),
      operators: repository([{ id: "OP-003", name: "UAT Operator 003", email: "", licenseNumber: "UAT-OP-003", certificationType: "None", status: "Active", joinedDate: "2026-08-01" }]),
      projects: repository([{ id: "PROJECT-3", projectName: "UAT Project 003" }]),
      rentals: repository([{ id: "RENTAL-1", rentalNumber: "RNT-2026-000001", customer: "UAT-CUS-001", status: "Active" }]),
      rentalEquipmentLines: repository([{ id: "LINE-1", rentalId: "RENTAL-1", assignmentId: "ASN-000003", equipmentId: "EQ-3", operatorId: "OP-003", status: "Active" }]),
      deurs: repository([]),
    },
  } as unknown as ApplicationDependencies;
}

afterEach(async () => { while (roots.length) await act(async () => roots.pop()?.unmount()); });

describe("Operator landing canonical projection", () => {
  it("resolves the signed-in linked Operator and current work from canonical read repositories", async () => {
    const container = document.createElement("div");
    const root = createRoot(container); roots.push(root);
    const deps = dependencies();
    await act(async () => {
      root.render(createElement(ApplicationDependencyContext.Provider, { value: deps }, createElement(MemoryRouter, null, createElement(OperatorLandingPage))));
      await Promise.resolve();
    });
    expect(container.textContent).toContain("Hello, UAT Operator 003");
    expect(container.textContent).toContain("UAT-EQP-003");
    expect(container.textContent).toContain("Start Shift");
    expect(deps.readRepositories.operators.list).toHaveBeenCalledTimes(1);
    expect(container.textContent).not.toContain("linked to your user account is unavailable");
  });
});
