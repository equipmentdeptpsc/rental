import { beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createElement, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";

import { storage } from "@/core/storage";
import type { AssignmentRecord } from "@/features/assignment/types";
import type { EquipmentRecord } from "@/features/equipment/types";
import type { RentalRecord } from "@/features/rental/types";

const assignment: AssignmentRecord = {
  id: "assignment-1", equipmentId: "equipment-1", operatorId: "operator-1", projectId: "project-1",
  assignedDate: "2026-07-17", expectedReturn: "", remarks: "keep this remark", status: "Active",
};

const equipment: EquipmentRecord = {
  id: "equipment-1", prefixId: "test", assetNo: "EQ-001", equipmentName: "Test Equipment",
  category: "Moving Equipment", maintenanceType: "Engine Hours", currentReading: 0, projectId: "project-1",
  operatorId: "operator-1", status: "Assigned", deleted: false,
};

const rental: RentalRecord = {
  id: "rental-1", rentalNumber: "R-001", equipmentId: "equipment-1", operatorId: "operator-1",
  assignmentId: "assignment-1", customerId: "customer-1", projectId: "project-1", customer: "Customer",
  project: "Project", rentedBy: "", dateOut: "2026-07-17", statusId: "", status: "Reserved",
};

interface Harness {
  assignment: ReturnType<typeof import("@/features/assignment/context/AssignmentContext")["useAssignment"]>;
  equipment: ReturnType<typeof import("@/features/equipment/context/EquipmentContext")["useEquipment"]>;
  path: string;
}

function prepareState(currentAssignment = assignment) {
  storage.set("assignments", [currentAssignment]);
  storage.set("equipment-records", [equipment]);
  storage.set("equipment-rental-records", [rental]);
  storage.set("operators", [{ id: "operator-1", name: "Operator", email: "", licenseNumber: "", certificationType: "None", status: "Active", joinedDate: "" }]);
  storage.set("projects", [{ id: "project-1", projectCode: "PRJ-001", projectName: "Project", client: "", location: "", projectManager: "", status: "Active" }]);
}

async function renderQuickActions(): Promise<{ harness: Harness; root: Root; container: HTMLDivElement }> {
  vi.resetModules();
  const [
    { MemoryRouter, useLocation },
    { ToastProvider },
    { AuthProvider },
    { AuditProvider },
    { EquipmentProvider, useEquipment },
    { EquipmentHistoryProvider },
    { OperatorProvider },
    { ProjectProvider },
    { AssignmentProvider, useAssignment },
    { RentalProvider },
    { default: RentalWorkspaceProvider },
    { default: AssignmentQuickActions },
  ] = await Promise.all([
    import("react-router-dom"),
    import("@/components/ui/toast/ToastContext"),
    import("@/features/auth/AuthContext"),
    import("@/features/equipment/audit/AuditContext"),
    import("@/features/equipment/context/EquipmentContext"),
    import("@/features/equipment/history/EquipmentHistoryContext"),
    import("@/features/operators/context/OperatorContext"),
    import("@/features/project/context/ProjectContext"),
    import("@/features/assignment/context/AssignmentContext"),
    import("@/features/rental/context/RentalContext"),
    import("@/features/rental/workspace/RentalWorkspaceProvider"),
    import("@/features/rental/workspace/assignments/AssignmentQuickActions"),
  ]);
  const harness = {} as Harness;
  function Probe() {
    harness.assignment = useAssignment();
    harness.equipment = useEquipment();
    harness.path = useLocation().pathname;
    return null;
  }
  const providers = (children: ReactNode) => createElement(
    MemoryRouter, { initialEntries: ["/rentals/rental-1/workspace"] },
    createElement(ToastProvider, null, createElement(AuthProvider, null, createElement(AuditProvider, null,
      createElement(EquipmentProvider, null, createElement(EquipmentHistoryProvider, null,
        createElement(OperatorProvider, null, createElement(ProjectProvider, null,
          createElement(AssignmentProvider, null, createElement(RentalProvider, null,
            createElement(RentalWorkspaceProvider, { rentalId: "rental-1", children })
          ))
        ))
      ))
    )))
  );
  const container = document.createElement("div");
  const root = createRoot(container);
  await act(async () => root.render(providers(createElement("div", null, createElement(Probe), createElement(AssignmentQuickActions)))));
  return { harness, root, container };
}

function button(container: HTMLDivElement, label: string): HTMLButtonElement {
  const target = [...container.querySelectorAll("button")].find((item) => item.textContent === label);
  if (!target) throw new Error(`Button not found: ${label}`);
  return target;
}

describe("assignment workspace quick actions", () => {
  beforeEach(() => {
    storage.clear();
    vi.restoreAllMocks();
  });

  it("routes Replace Operator to the existing assignment edit workflow", async () => {
    prepareState();
    const { harness, root, container } = await renderQuickActions();

    await act(async () => button(container, "Replace Operator").click());

    expect(harness.path).toBe("/assignments/assignment-1/edit");
    expect(container.textContent).not.toContain("Replace Equipment");
    await act(async () => root.unmount());
    container.remove();
  }, 15_000);

  it("completes once, synchronizes equipment, and persists the assignment state", async () => {
    prepareState();
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    const beforeRental = structuredClone(rental);
    const { harness, root, container } = await renderQuickActions();

    await act(async () => {
      button(container, "Complete Assignment").click();
      button(container, "Complete Assignment").click();
    });

    expect(confirm).toHaveBeenCalledTimes(1);
    expect(harness.assignment.getAssignment("assignment-1")).toMatchObject({ status: "Completed", remarks: "keep this remark" });
    expect(harness.equipment.getEquipment("equipment-1")).toMatchObject({ status: "Available", projectId: "", operatorId: "" });
    expect(storage.get<RentalRecord[]>("equipment-rental-records")).toEqual([beforeRental]);
    await act(async () => root.unmount());
    container.remove();

    vi.resetModules();
    const { assignmentRepository } = await import("@/features/assignment/repository");
    expect(assignmentRepository.getById("assignment-1")?.status).toBe("Completed");
  });

  it("blocks completed assignments without mutating the persisted state", async () => {
    prepareState({ ...assignment, status: "Completed" });
    const before = structuredClone(storage.get<AssignmentRecord[]>("assignments"));
    const { root, container } = await renderQuickActions();

    expect(button(container, "Replace Operator").disabled).toBe(true);
    expect(button(container, "Complete Assignment").disabled).toBe(true);
    expect(storage.get<AssignmentRecord[]>("assignments")).toEqual(before);
    await act(async () => root.unmount());
    container.remove();
  });
});
