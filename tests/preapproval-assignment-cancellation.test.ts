// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { classifyAssignmentRentalPreparation } from "@/features/assignment/hooks/useAssignmentRentalPreparation";
import type { RentalEquipmentLine } from "@/features/rental/equipment-line/types";
import type { RentalRecord } from "@/features/rental/types";

const harness = vi.hoisted(() => ({
  preparation: { kind: "none" } as { kind: string; rental?: RentalRecord; count?: number },
  manageAllowed: true,
}));

vi.mock("@/app/composition", () => {
  const dependencies = {
    configuration: { persistenceMode: "remote", remoteAssignmentCancelEnabled: true, remoteRentalCreateEnabled: true, remoteOperationalWritesEnabled: false },
    commandRepositories: {
      canonicalAssignment: { cancelAssignment: vi.fn() },
      canonicalAssignmentActivityCode: { amendActivityCode: vi.fn() },
      canonicalRental: { readReferenceData: async () => ({ success: true, value: { activityCodes: [{ id: "activity-1", code: "ACT-1", name: "Excavation", active: true, sortOrder: 1 }] } }) },
    },
  };
  return { PersistenceMode: { Local: "local", Remote: "remote" }, useApplicationDependenciesCompatibility: () => dependencies };
});
vi.mock("@/features/auth/AuthContext", () => ({ useAuth: () => ({ hasPermission: (permission: string) => permission !== "assignment.manage" || harness.manageAllowed }) }));
vi.mock("@/features/assignment/hooks/useCanonicalAssignmentData", () => ({
  useCanonicalAssignmentData: () => ({ status: "loaded", retry: () => undefined, data: {
    assignments: [{ id: "assignment-1", equipmentId: "equipment-1", operatorId: "operator-1", projectId: "project-1", assignedDate: "2026-10-08", status: "Active", remarks: "", rowVersion: 1 }],
    equipment: [{ id: "equipment-1", assetNo: "EQ-1", equipmentName: "Excavator" }],
    operators: [{ id: "operator-1", name: "Miguel Santos" }],
    projects: [{ id: "project-1", name: "Project A" }], customers: [],
  } }),
}));
vi.mock("@/features/assignment/hooks/useAssignmentRentalPreparation", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/features/assignment/hooks/useAssignmentRentalPreparation")>(),
  useAssignmentRentalPreparation: () => harness.preparation,
}));

const draft = { id: "rental-1", assignmentId: "assignment-1", status: "Draft", approvalStatus: "NotSubmitted" } as RentalRecord;
const line = { id: "line-1", rentalId: "rental-1", assignmentId: "assignment-1", status: "Draft" } as RentalEquipmentLine;
const migration = readFileSync("supabase/migrations/20261008000300_preapproval_assignment_cancellation.sql", "utf8");

async function renderDetails() {
  const { default: Details } = await import("@/pages/Assignments/Details");
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  await act(async () => root.render(createElement(MemoryRouter, { initialEntries: ["/assignments/assignment-1"] },
    createElement(Routes, null, createElement(Route, { path: "/assignments/:id", element: createElement(Details) })))));
  return { container, close: async () => { await act(async () => root.unmount()); container.remove(); } };
}

describe("pre-approval Assignment cancellation", () => {
  it("classifies no Rental, Draft preparation, and committed lifecycles", () => {
    expect(classifyAssignmentRentalPreparation("assignment-1", [], [])).toEqual({ kind: "none" });
    expect(classifyAssignmentRentalPreparation("assignment-1", [draft], [line])).toMatchObject({ kind: "draft", rental: draft });
    for (const status of ["Reserved", "Released", "Active", "Returned", "Closed"] as const) {
      expect(classifyAssignmentRentalPreparation("assignment-1", [{ ...draft, status }], [line])).toEqual({ kind: "committed" });
    }
    expect(classifyAssignmentRentalPreparation("assignment-1", [{ ...draft, approvalStatus: "Approved" }], [line])).toEqual({ kind: "committed" });
    expect(classifyAssignmentRentalPreparation("assignment-1", [draft], [{ ...line, status: "Released" }])).toEqual({ kind: "committed" });
    expect(classifyAssignmentRentalPreparation("assignment-1", [{ ...draft, status: "Cancelled" }], [{ ...line, status: "Cancelled" }])).toEqual({ kind: "none" });
  });

  it("uses the existing Draft Rental and opens explicit cancellation confirmation", async () => {
    harness.preparation = { kind: "draft", rental: draft, count: 1 };
    harness.manageAllowed = true;
    const view = await renderDetails();
    expect(view.container.textContent).toContain("Continue Rental Preparation");
    expect(view.container.querySelector('a[href="/rentals/rental-1/commercial-terms"]')).not.toBeNull();
    expect(view.container.textContent).not.toContain("Start Rental");
    expect(view.container.textContent).toContain("Edit Activity Code");
    await act(async () => view.container.querySelector<HTMLButtonElement>('button')?.click());
    expect(view.container.querySelector('[role="group"][aria-label="Edit Activity Code"]')).not.toBeNull();
    const cancel = [...view.container.querySelectorAll("button")].find((button) => button.textContent === "Cancel Assignment");
    await act(async () => cancel?.click());
    expect(view.container.querySelector('[role="alertdialog"]')?.textContent).toContain("Draft Rental that has not yet been approved");
    expect(view.container.querySelector('[role="alertdialog"]')?.textContent).toContain("Keep Assignment");
    await view.close();
  });

  it("keeps Start Rental for an unlinked Assignment and locks edits after approval", async () => {
    harness.preparation = { kind: "none" };
    let view = await renderDetails();
    expect(view.container.querySelector('a[href="/rentals/new?assignment=assignment-1"]')).not.toBeNull();
    await view.close();
    harness.preparation = { kind: "committed" };
    view = await renderDetails();
    expect(view.container.textContent).not.toContain("Edit Activity Code");
    expect(view.container.textContent).not.toContain("Cancel Assignment");
    expect(view.container.textContent).toContain("approved or active rental");
    await view.close();
    harness.preparation = { kind: "draft", rental: draft, count: 1 };
    harness.manageAllowed = false;
    view = await renderDetails();
    expect(view.container.textContent).not.toContain("Edit Activity Code");
    await view.close();
  });

  it("keeps the direct RPC guarded and composes the existing Rental cancellation atomically", () => {
    expect(migration).toContain("erp.current_user_has_permission('assignment.close')");
    expect(migration).toContain("erp.current_user_has_permission('rental.update')");
    expect(migration).toContain("linked_rental.approval_status = 'Approved'");
    expect(migration).toContain("line.status <> 'Draft'");
    expect(migration).toContain("erp.command_cancel_rental(jsonb_build_object(");
    expect(migration).toContain("RAISE EXCEPTION 'Linked Draft Rental cancellation failed'");
    expect(migration).toContain("UPDATE erp.rental_contracts SET status = 'Cancelled'");
    expect(migration).toContain("SET status_id = available_status, project_id = NULL, operator_id = NULL");
    expect(migration).toContain("'ASSIGNMENT_CANCELLED'");
  });
});
