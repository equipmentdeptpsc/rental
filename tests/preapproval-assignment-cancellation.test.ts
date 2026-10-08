// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { classifyAssignmentRentalPreparation } from "@/features/assignment/hooks/useAssignmentRentalPreparation";
import type { RentalEquipmentLine } from "@/features/rental/equipment-line/types";
import type { RentalRecord } from "@/features/rental/types";

const harness = vi.hoisted(() => ({
  preparation: { kind: "none" } as { kind: string; rental?: RentalRecord; count?: number },
  updateAllowed: true,
  assignment: { id: "assignment-1", equipmentId: "equipment-1", operatorId: "operator-1", projectId: "project-1", assignedDate: "2026-10-08", status: "Active", remarks: "", rowVersion: 1 } as Record<string, unknown>,
  cancelResult: undefined as unknown,
  amendResult: undefined as unknown,
  lastAmendCommand: undefined as unknown,
}));

vi.mock("@/app/composition", () => {
  const dependencies = {
    configuration: { persistenceMode: "remote", remoteAssignmentCancelEnabled: true, remoteRentalCreateEnabled: true, remoteOperationalWritesEnabled: false },
    commandRepositories: {
      canonicalAssignment: { cancelAssignment: async () => harness.cancelResult },
      canonicalAssignmentActivityCode: { amendActivityCode: async (command: unknown) => { harness.lastAmendCommand = command; return harness.amendResult; } },
      canonicalRental: { readReferenceData: async () => ({ success: true, value: { activityCodes: [{ id: "activity-1", code: "ACT-1", name: "Excavation", active: true, sortOrder: 1 }, { id: "activity-2", code: "ACT-2", name: "Hauling", active: true, sortOrder: 2 }] } }) },
    },
  };
  return { PersistenceMode: { Local: "local", Remote: "remote" }, useApplicationDependenciesCompatibility: () => dependencies };
});
vi.mock("@/features/auth/AuthContext", () => ({ useAuth: () => ({ hasPermission: (permission: string) => permission !== "assignment.update" || harness.updateAllowed }) }));
vi.mock("@/features/assignment/hooks/useCanonicalAssignmentData", () => ({
  useCanonicalAssignmentData: () => ({ status: "loaded", retry: () => undefined, data: {
    assignments: [harness.assignment],
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

async function renderDetails(initialEntry = "/assignments/assignment-1") {
  const { default: Details } = await import("@/pages/Assignments/Details");
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  await act(async () => root.render(createElement(MemoryRouter, { initialEntries: [initialEntry] },
    createElement(Routes, null,
      createElement(Route, { path: "/assignments/:id", element: createElement(Details) }),
      createElement(Route, { path: "/rentals/:id/commercial-terms", element: createElement("p", null, "Rental preparation destination") })))));
  return { container, close: async () => { await act(async () => root.unmount()); container.remove(); } };
}

describe("pre-approval Assignment cancellation", () => {
  beforeEach(() => {
    harness.updateAllowed = true;
    harness.assignment = { id: "assignment-1", equipmentId: "equipment-1", operatorId: "operator-1", projectId: "project-1", assignedDate: "2026-10-08", status: "Active", remarks: "", rowVersion: 1 };
    harness.cancelResult = { success: true, value: { id: "assignment-1", equipmentId: "equipment-1", operatorId: "operator-1", status: "Cancelled", rowVersion: 2 } };
    harness.amendResult = { success: true, value: { id: "assignment-1", activityCodeId: "activity-1", rowVersion: 2 } };
    harness.lastAmendCommand = undefined;
  });
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
    harness.updateAllowed = true;
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
    harness.updateAllowed = false;
    view = await renderDetails();
    expect(view.container.textContent).not.toContain("Edit Activity Code");
    await view.close();
  });

  it("shows Change for an existing pre-approval code and sends the authoritative version", async () => {
    harness.assignment = { ...harness.assignment, activityCodeId: "activity-1", rowVersion: 7 };
    harness.amendResult = { success: true, value: { id: "assignment-1", activityCodeId: "activity-2", rowVersion: 8 } };
    harness.preparation = { kind: "draft", rental: draft, count: 1 };
    const view = await renderDetails();
    expect(view.container.textContent).toContain("ACT-1 — Excavation");
    const change = [...view.container.querySelectorAll("button")].find((button) => button.textContent === "Change");
    await act(async () => change?.click());
    const select = view.container.querySelector<HTMLSelectElement>('select');
    await act(async () => { if (select) { select.value = "activity-2"; select.dispatchEvent(new Event("change", { bubbles: true })); } });
    const save = [...view.container.querySelectorAll("button")].find((button) => button.textContent === "Save Activity Code");
    await act(async () => save?.click());
    expect(harness.lastAmendCommand).toMatchObject({ assignmentId: "assignment-1", expectedVersion: 7, activityCodeId: "activity-2" });
    expect(view.container.textContent).toContain("ACT-2 — Hauling");
    await view.close();
  });

  it("removes all preparation actions immediately after cancellation succeeds", async () => {
    harness.preparation = { kind: "draft", rental: draft, count: 1 };
    const view = await renderDetails();
    const cancel = [...view.container.querySelectorAll("button")].find((button) => button.textContent === "Cancel Assignment");
    await act(async () => cancel?.click());
    const confirm = [...view.container.querySelectorAll('[role="alertdialog"] button')].find((button) => button.textContent === "Cancel Assignment");
    await act(async () => (confirm as HTMLButtonElement | undefined)?.click());
    expect(view.container.textContent).toContain("Cancelled");
    expect(view.container.textContent).not.toContain("Continue Rental Preparation");
    expect(view.container.textContent).not.toContain("Start Rental");
    expect(view.container.textContent).not.toContain("Edit Activity Code");
    expect(view.container.textContent).not.toContain("Change");
    expect(view.container.textContent).not.toContain("Cancel Assignment");
    await view.close();
  });

  it("returns to the same Rental preparation step after Activity Code save", async () => {
    harness.preparation = { kind: "draft", rental: draft, count: 1 };
    const returnTo = "/rentals/rental-1/commercial-terms?step=deur";
    const view = await renderDetails(`/assignments/assignment-1?returnTo=${encodeURIComponent(returnTo)}`);
    const edit = [...view.container.querySelectorAll("button")].find((button) => button.textContent === "Edit Activity Code");
    await act(async () => edit?.click());
    const select = view.container.querySelector<HTMLSelectElement>('select');
    await act(async () => { if (select) { select.value = "activity-1"; select.dispatchEvent(new Event("change", { bubbles: true })); } });
    const save = [...view.container.querySelectorAll("button")].find((button) => button.textContent === "Save Activity Code");
    await act(async () => save?.click());
    expect(view.container.textContent).toContain("Rental preparation destination");
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
