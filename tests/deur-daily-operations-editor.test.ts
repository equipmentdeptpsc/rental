import { beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createElement, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";

import { storage } from "@/core/storage";
import { StartActivityService } from "@/features/rental/deur/services/StartActivityService";
import type { DeurRecord } from "@/features/rental/deur/types";

const deur = (): DeurRecord => ({
  id: "deur-1", rentalId: "rental-1", assignmentId: "assignment-1", equipmentId: "equipment-1", operatorId: "operator-1", projectId: "project-1",
  workDate: "2026-07-17", logs: [], totalOperatingMinutes: 120, totalIdleMinutes: 60, totalMaintenanceMinutes: 0,
  totalMealBreakMinutes: 0, totalMobilizationMinutes: 0, totalDemobilizationMinutes: 0, status: "Draft", billingLocked: false,
  createdAt: "2026-07-17T00:00:00.000Z", updatedAt: "2026-07-17T00:00:00.000Z",
});

function prepareState(record = deur()) {
  storage.set("equipment-rental-deur", [record]);
  storage.set("equipment-rental-records", [{ id: "rental-1", rentalNumber: "R-001", equipmentId: "equipment-1", operatorId: "operator-1", assignmentId: "assignment-1", customerId: "customer-1", projectId: "project-1", customer: "Customer", project: "Project", rentedBy: "", dateOut: "2026-07-17", statusId: "", status: "Released" }]);
  storage.set("assignments", [{ id: "assignment-1", equipmentId: "equipment-1", operatorId: "operator-1", projectId: "project-1", assignedDate: "2026-07-17", expectedReturn: "", remarks: "", status: "Active" }]);
  storage.set("equipment-records", [{ id: "equipment-1", prefixId: "test", assetNo: "EQ-001", equipmentName: "Equipment", category: "Moving Equipment", maintenanceType: "Engine Hours", currentReading: 0, projectId: "project-1", operatorId: "operator-1", status: "Rented", deleted: false }]);
  storage.set("operators", [{ id: "operator-1", name: "Operator", email: "", licenseNumber: "", certificationType: "None", status: "Active", joinedDate: "" }]);
  storage.set("projects", [{ id: "project-1", projectCode: "PRJ-001", projectName: "Project", client: "", location: "", projectManager: "", status: "Active" }]);
}

async function renderEditor(): Promise<{ root: Root; container: HTMLDivElement }> {
  vi.resetModules();
  const [
    { ToastProvider }, { AuthProvider }, { AuditProvider }, { EquipmentProvider }, { EquipmentHistoryProvider },
    { OperatorProvider }, { ProjectProvider }, { AssignmentProvider }, { RentalProvider }, { default: RentalWorkspaceProvider }, { default: DeurHoursEntry },
  ] = await Promise.all([
    import("@/components/ui/toast/ToastContext"), import("@/features/auth/AuthContext"), import("@/features/equipment/audit/AuditContext"),
    import("@/features/equipment/context/EquipmentContext"), import("@/features/equipment/history/EquipmentHistoryContext"),
    import("@/features/operators/context/OperatorContext"), import("@/features/project/context/ProjectContext"),
    import("@/features/assignment/context/AssignmentContext"), import("@/features/rental/context/RentalContext"),
    import("@/features/rental/workspace/RentalWorkspaceProvider"), import("@/features/rental/workspace/deur/DeurHoursEntry"),
  ]);
  const providers = (children: ReactNode) => {
    let tree: ReactNode = createElement(RentalWorkspaceProvider, { rentalId: "rental-1", children });
    tree = createElement(RentalProvider, null, tree);
    tree = createElement(AssignmentProvider, null, tree);
    tree = createElement(ProjectProvider, null, tree);
    tree = createElement(OperatorProvider, null, tree);
    tree = createElement(EquipmentHistoryProvider, null, tree);
    tree = createElement(EquipmentProvider, null, tree);
    tree = createElement(AuditProvider, null, tree);
    tree = createElement(AuthProvider, null, tree);
    return createElement(ToastProvider, null, tree);
  };
  const container = document.createElement("div");
  const root = createRoot(container);
  await act(async () => root.render(providers(createElement(DeurHoursEntry))));
  return { root, container };
}

function input(container: HTMLDivElement, index: number) {
  return container.querySelectorAll("input")[index] as HTMLInputElement;
}

async function change(inputElement: HTMLInputElement, value: string) {
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    setter?.call(inputElement, value);
    inputElement.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

describe("Daily Operations DEUR editor", () => {
  beforeEach(() => {
    storage.clear();
    vi.restoreAllMocks();
  });

  it("saves one active DEUR, clears dirty state, and restores saved values after reload", async () => {
    prepareState();
    const { root, container } = await renderEditor();
    await change(input(container, 1), "3");
    expect(container.textContent).toContain("Unsaved changes");

    await act(async () => container.querySelector("button")?.click());
    await act(async () => container.querySelector("button")?.click());

    expect(container.textContent).not.toContain("Unsaved changes");
    await act(async () => root.unmount());
    container.remove();

    vi.resetModules();
    const { deurRepository } = await import("@/features/rental/deur/repository/deurRepository");
    expect(deurRepository.getByRentalId("rental-1")).toHaveLength(1);
    expect(deurRepository.getById("deur-1")?.totalOperatingMinutes).toBe(180);

    const restored = await renderEditor();
    expect(input(restored.container, 1).value).toBe("3");
    await act(async () => restored.root.unmount());
    restored.container.remove();
  });

  it("undoes unsaved hours back to the last persisted values", async () => {
    prepareState();
    const { root, container } = await renderEditor();
    await change(input(container, 2), "5");
    expect(container.textContent).toContain("Unsaved changes");

    await act(async () => [...container.querySelectorAll("button")].find((item) => item.textContent === "Undo Changes")?.click());

    expect(input(container, 2).value).toBe("1");
    expect(container.textContent).not.toContain("Unsaved changes");
    await act(async () => root.unmount());
    container.remove();
  });

  it("preserves unsaved hours while an activity switch refreshes the active DEUR", async () => {
    prepareState();
    const { root, container } = await renderEditor();
    await change(input(container, 1), "3");

    await act(async () => {
      StartActivityService.execute({ rentalId: "rental-1", equipmentId: "equipment-1", operatorId: "operator-1", deurId: "deur-1", activity: "Operation" });
    });

    expect(input(container, 1).value).toBe("3");
    expect(container.textContent).toContain("Unsaved changes");
    await act(async () => root.unmount());
    container.remove();
  });

  it("switches activities in the active DEUR without mixing logs or mutating the input", () => {
    const record = { ...deur(), logs: [{ id: "operation", activity: "Operation" as const, startTime: "2026-07-17T08:00:00.000Z", durationMinutes: 0 }], billingStatementId: "statement-1" };
    const before = structuredClone(record);
    prepareState(record);

    const switched = StartActivityService.execute({ rentalId: "rental-1", equipmentId: "equipment-1", operatorId: "operator-1", deurId: "deur-1", activity: "Idle" });
    const repeated = StartActivityService.execute({ rentalId: "rental-1", equipmentId: "equipment-1", operatorId: "operator-1", deurId: "deur-1", activity: "Idle" });

    expect(switched.logs).toHaveLength(2);
    expect(switched.logs[0].endTime).toBeTruthy();
    expect(switched.logs[1].activity).toBe("Idle");
    expect(switched.logs[1].endTime).toBeUndefined();
    expect(repeated.logs).toHaveLength(2);
    expect(switched).toMatchObject({ totalOperatingMinutes: 120, totalIdleMinutes: 60 });
    expect(switched.billingStatementId).toBe("statement-1");
    expect(record).toEqual(before);
  });
});
