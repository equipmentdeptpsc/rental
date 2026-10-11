import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Link, MemoryRouter, Route, Routes, useLocation } from "react-router-dom";

const permission = vi.hoisted(() => ({ preparation: false, assignment: false }));
const canonicalRental = vi.hoisted(() => ({
  readReferenceData: vi.fn(async () => ({ success: true as const, value: { costCodes: [], activityCodes: [{ id: "activity-1", code: "ACT-1", name: "Crane work", active: true, sortOrder: 1 }] } })),
  configureLineAssignment: vi.fn(async () => ({ success: true as const, disposition: "ACCEPTED" as const, value: { rentalId: "r-1", version: 3, status: "Draft" } })),
}));
vi.mock("@/features/auth/AuthContext", () => ({ useAuth: () => ({ hasPermission: (name: string) => (permission.preparation && name === "rental.commercialTerms.update") || (permission.assignment && ["rental.update", "assignment.create", "assignment.read"].includes(name)) }) }));
vi.mock("@/app/composition", async (original) => ({ ...(await original<object>()), useApplicationDependenciesCompatibility: () => ({ configuration: { persistenceMode: "remote", remoteRentalCommercialTermsEnabled: true, remoteRentalLineAssignmentEnabled: true }, commandRepositories: { canonicalRental } }) }));
vi.mock("@/features/rental/remote/RemoteCommercialTermsPage", () => ({ default: () => createElement("p", null, "Inline canonical preparation") }));
vi.mock("@/features/rental/components/RentalQuickActions", () => ({ default: () => createElement("button", { type: "button" }, "Submit for Approval") }));

import AddedEquipmentStatusPanel from "@/features/rental/workspace/overview/sections/AddedEquipmentStatusPanel";
import type { RentalRecord } from "@/features/rental/types";
import type { RentalEquipmentLine } from "@/features/rental/equipment-line/types";
import { clearCommercialPreparationSessionDrafts, preserveCommercialPreparationSessionDrafts, readCommercialPreparationSessionDrafts } from "@/features/rental/remote/commercialPreparationDraftSession";
import type { CommercialPreparationDraft } from "@/features/rental/remote/commercialPreparationValidation";

const rental = { id: "r-1", rentalNumber: "RNT-1", dateOut: "2026-10-08", expectedReturn: "2026-10-20", rentalType: "Operated Rental", status: "Draft", rowVersion: 2, approvalStatus: "Rejected", approvalDecisionRemarks: "Missing terms" } as RentalRecord;
const lines = [
  { id: "line-1", rentalId: "r-1", equipmentId: "e-1", operatorId: "", status: "Draft", effectiveStartDate: "2026-10-10" },
  { id: "line-2", rentalId: "r-1", equipmentId: "e-2", operatorId: "operator-2", status: "Returned", effectiveStartDate: "2026-10-09" },
] as RentalEquipmentLine[];
const roots: Root[] = [];

async function render(lineItems = lines) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container); roots.push(root);
  const panel = createElement(AddedEquipmentStatusPanel, {
    rental, lines: lineItems,
    equipment: [{ id: "e-1", assetNo: "EQ-1", equipmentName: "Crane" }, { id: "e-2", assetNo: "EQ-2", equipmentName: "Loader" }] as never,
    assignments: [], operators: [{ id: "operator-2", name: "Operator Two", status: "Active" }] as never, contracts: [],
  });
  await act(async () => root.render(createElement(MemoryRouter, { initialEntries: ["/rentals/r-1/workspace"] }, createElement(Routes, null,
    createElement(Route, { path: "/rentals/:rentalId/workspace", element: panel }),
    createElement(Route, { path: "/assignments/:id", element: createElement(AssignmentDestination) }),
  ))));
  await act(async () => container.querySelector<HTMLButtonElement>("button")?.click());
  return container;
}

function AssignmentDestination() {
  const location = useLocation();
  return createElement("div", null, "Assignment destination", createElement(Link, { to: "/rentals/r-1/workspace", state: location.state }, "Return to Rental Workspace"));
}

afterEach(async () => { permission.preparation = false; permission.assignment = false; vi.clearAllMocks(); while (roots.length) await act(async () => roots.pop()?.unmount()); document.body.innerHTML = ""; });

describe("View Added Equipment Status", () => {
  it("shows a meaningful empty state", async () => {
    const container = await render([]);
    expect(container.textContent).toContain("No equipment has been added");
  });

  it("shows multiple lines, persisted dates, blockers, rejection, and historical return state", async () => {
    const container = await render();
    expect(container.textContent).toContain("EQ-1 — Crane");
    expect(container.textContent).toContain("EQ-2 — Loader");
    expect(container.textContent).toContain("2026-10-10 → 2026-10-20");
    expect(container.textContent).toContain("Operator not assigned");
    expect(container.textContent).toContain("Rejected");
    expect(container.textContent).toContain("Missing terms");
    expect(container.textContent).toContain("Historical / read-only");
    expect(container.textContent).not.toContain("Inline canonical preparation");
  });

  it("exposes canonical preparation only with the existing permission", async () => {
    permission.preparation = true;
    const container = await render();
    const prepare = [...container.querySelectorAll("button")].find((button) => button.textContent === "Complete preparation inline");
    expect(prepare).toBeTruthy();
    await act(async () => prepare?.click());
    expect(container.textContent).toContain("Inline canonical preparation");
  });

  it("keeps Assignment creation and attachment inside the opened workspace", async () => {
    permission.assignment = true;
    const container = await render();
    const configure = [...container.querySelectorAll("button")].find((button) => button.textContent === "Configure assignment");
    expect(configure).toBeTruthy();
    await act(async () => configure?.click());
    await act(async () => { await Promise.resolve(); });
    expect(container.textContent).toContain("Activity Code");
    expect(container.textContent).toContain("Create and attach assignment");
    expect(canonicalRental.readReferenceData).toHaveBeenCalled();
  });

  it("offers direct Assignment navigation and restores the inline draft after returning", async () => {
    permission.assignment = true;
    canonicalRental.configureLineAssignment.mockResolvedValueOnce({ success: false as const, code: "OPERATOR_ALREADY_ASSIGNED" as const, message: "This operator already has an active Assignment.", details: { assignmentId: "assignment-9", assignedDate: "2026-10-01" } });
    const container = await render();
    await act(async () => [...container.querySelectorAll("button")].find((button) => button.textContent === "Configure assignment")?.click());
    await act(async () => { await Promise.resolve(); });
    const selects = container.querySelectorAll<HTMLSelectElement>("select");
    await act(async () => { selects[0].value = "operator-2"; selects[0].dispatchEvent(new Event("change", { bubbles: true })); selects[1].value = "activity-1"; selects[1].dispatchEvent(new Event("change", { bubbles: true })); });
    const start = container.querySelector<HTMLInputElement>('input[type="date"]')!;
    await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(start, "2026-10-12"); start.dispatchEvent(new Event("input", { bubbles: true })); });
    await act(async () => { [...container.querySelectorAll("button")].find((button) => button.textContent === "Create and attach assignment")?.click(); await Promise.resolve(); });
    const view = [...container.querySelectorAll("a")].find((link) => link.textContent === "View Assignment");
    expect(view?.getAttribute("href")).toBe("/assignments/assignment-9");
    await act(async () => view?.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true })));
    expect(container.textContent).toContain("Assignment destination");
    await act(async () => [...container.querySelectorAll("a")].find((link) => link.textContent === "Return to Rental Workspace")?.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true })));
    expect(container.querySelector<HTMLSelectElement>("select")?.value).toBe("operator-2");
    expect(container.querySelector<HTMLInputElement>('input[type="date"]')?.value).toBe("2026-10-12");
    await act(async () => { [...container.querySelectorAll("button")].find((button) => button.textContent === "Create and attach assignment")?.click(); await Promise.resolve(); });
    expect(canonicalRental.configureLineAssignment).toHaveBeenCalledTimes(2);
    expect(container.textContent).toContain("Assignment saved from the canonical service");
  });

  it("preserves commercial preparation drafts across a workspace navigation remount", () => {
    const draft = { billingMethod: "Per Hour", currency: "PHP", unitRate: "1200", idleRate: "", standbyRate: "", discountType: "NONE", discountValue: "0", transactionRelationship: "Non-Affiliate", vatApplicability: "Applicable", taxRate: "12", operatorIncluded: true, costCodeId: "cost-1", activityCodeId: "activity-1", workDescriptionId: "work-1", remarks: "keep me" } satisfies CommercialPreparationDraft;
    preserveCommercialPreparationSessionDrafts("r-1", { "line-1": draft });
    expect(readCommercialPreparationSessionDrafts("r-1")).toEqual({ "line-1": draft });
    clearCommercialPreparationSessionDrafts("r-1");
    expect(readCommercialPreparationSessionDrafts("r-1")).toEqual({});
  });
});
