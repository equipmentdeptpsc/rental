// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const fixture = vi.hoisted(() => ({ rentalStatus: "Cancelled", assignmentStatus: "Cancelled" }));
vi.mock("@/app/composition", () => {
  const dependencies = {
    configuration: { persistenceMode: "remote", remoteRentalCommercialTermsEnabled: true },
    commandRepositories: { canonicalRental: {} },
    readRepositories: { workDescriptions: { list: async () => ({ success: true, value: { items: [] } }) } },
  };
  return { useApplicationDependenciesCompatibility: () => dependencies };
});
vi.mock("@/features/auth/AuthContext", () => ({ useAuth: () => ({ hasPermission: () => true }) }));
vi.mock("@/features/rental/context/RentalContext", () => ({ useRental: () => ({ rentals: [], rentalEquipmentLines: [] }) }));
vi.mock("@/features/assignment/context/AssignmentContext", () => ({ useAssignment: () => ({ assignments: [] }) }));
vi.mock("@/features/equipment/context/EquipmentContext", () => ({ useEquipment: () => ({ equipment: [] }) }));
vi.mock("@/features/operators/context/OperatorContext", () => ({ useOperator: () => ({ operators: [] }) }));
vi.mock("@/features/project/context/ProjectContext", () => ({ useProject: () => ({ projects: [] }) }));
vi.mock("@/features/customer/context/CustomerContext", () => ({ useCustomer: () => ({ customers: [] }) }));
vi.mock("@/features/rental/services/rentalRuntimeCapability", () => ({ canUseCanonicalRemoteRentalCommercialTermsMutation: () => true }));
vi.mock("@/features/rental/hooks/useRentalListData", () => ({ useRentalListData: () => ({ status: "loaded", retry: () => undefined, data: {
  rentals: [{ id: "rental-1", rentalNumber: "R-1", status: fixture.rentalStatus, approvalStatus: "NotSubmitted", rentalType: "Operated Rental", dateOut: "2026-10-08", rowVersion: 1 }],
  rentalEquipmentLines: [{ id: "line-1", rentalId: "rental-1", assignmentId: "assignment-1", equipmentId: "equipment-1", operatorId: "operator-1", status: fixture.rentalStatus === "Cancelled" ? "Cancelled" : "Draft" }],
  assignments: [{ id: "assignment-1", equipmentId: "equipment-1", operatorId: "operator-1", status: fixture.assignmentStatus }],
  equipment: [{ id: "equipment-1", assetNo: "EQ-1", equipmentName: "Excavator", maintenanceType: "Engine Hours" }],
  operators: [], projects: [], customers: [], costCodes: [], activityCodes: [],
} }) }));
vi.mock("@/features/rental/remote/useCanonicalRentalRemoteData", () => ({
  useCanonicalRentalWorkspace: () => ({ status: "loaded", data: { contracts: [] }, retry: () => undefined }),
  useCanonicalRentalReferenceData: () => ({ status: "loaded", data: { costCodes: [], activityCodes: [] }, retry: () => undefined }),
}));

async function renderRoute() {
  const { default: Page } = await import("@/features/rental/remote/RemoteCommercialTermsPage");
  const container = document.createElement("div"); document.body.append(container);
  const root = createRoot(container);
  await act(async () => root.render(createElement(MemoryRouter, null, createElement(Page, { rentalId: "rental-1" }))));
  return { container, close: async () => { await act(async () => root.unmount()); container.remove(); } };
}

describe("Commercial Terms preparation route", () => {
  beforeEach(() => { fixture.rentalStatus = "Cancelled"; fixture.assignmentStatus = "Cancelled"; });
  it("blocks a cancelled Rental without exposing preparation inputs or Edit Assignment", async () => {
    const view = await renderRoute();
    expect(view.container.textContent).toContain("This rental preparation has been cancelled and can no longer be edited.");
    expect(view.container.textContent).not.toContain("Edit Assignment");
    expect(view.container.querySelector("input,select,textarea")).toBeNull();
    await view.close();
  });
  it("retains preparation and the Assignment return link for an Active Draft", async () => {
    fixture.rentalStatus = "Draft"; fixture.assignmentStatus = "Active";
    const view = await renderRoute();
    expect(view.container.textContent).toContain("Edit Assignment");
    expect(view.container.querySelector('a[href*="returnTo="]')).not.toBeNull();
    expect(view.container.textContent).toContain("Save Preparation");
    await view.close();
  });
});
