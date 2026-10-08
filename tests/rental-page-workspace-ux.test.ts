import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, useLocation } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import RentalPage from "@/pages/Rental";

const fixture = vi.hoisted(() => {
  const rental = { id: "rental-1", rentalNumber: "RNT-001", equipmentId: "equipment-1", customerId: "customer-1", projectId: "project-1", customer: "North Harbor", project: "Pier Works", rentedBy: "", dateOut: "2026-10-08", expectedReturn: "2026-10-12", statusId: "active", status: "Active" };
  const data = {
    rentals: [rental], rentalEquipmentLines: [{ id: "line-1", rentalId: "rental-1", equipmentId: "equipment-1", operatorId: "operator-1", status: "Active", createdAt: "", updatedAt: "" }],
    equipment: [{ id: "equipment-1", assetNo: "EX-12", equipmentName: "Excavator", category: "Moving Equipment" }],
    assignments: [], operators: [{ id: "operator-1", name: "Ada Operator" }],
    projects: [{ id: "project-1", projectCode: "P-7", projectName: "Pier Works", customerId: "customer-1" }],
    customers: [{ id: "customer-1", companyName: "North Harbor" }], costCodes: [], activityCodes: [],
  };
  return { data };
});

vi.mock("@/app/composition", async (importOriginal) => ({ ...(await importOriginal<object>()), useApplicationDependenciesCompatibility: () => ({ configuration: { persistenceMode: "remote" }, commandRepositories: {}, repositories: { billingStatement: { getByRentalId: () => [] } } }) }));
vi.mock("@/features/auth/AuthContext", () => ({ useAuth: () => ({ hasPermission: () => false }) }));
vi.mock("@/features/rental/context/RentalContext", () => ({ useRental: () => ({ rentals: [], rentalEquipmentLines: [] }) }));
vi.mock("@/features/equipment/context/EquipmentContext", () => ({ useEquipment: () => ({ equipment: [] }) }));
vi.mock("@/features/assignment/context/AssignmentContext", () => ({ useAssignment: () => ({ assignments: [] }) }));
vi.mock("@/features/operators/context/OperatorContext", () => ({ useOperator: () => ({ operators: [] }) }));
vi.mock("@/features/project/context/ProjectContext", () => ({ useProject: () => ({ projects: [] }) }));
vi.mock("@/features/rental/hooks/useRentalListData", () => ({ useRentalListData: () => ({ status: "loaded", data: fixture.data }) }));
vi.mock("@/features/rental/deur/repository/deurRepository", () => ({ deurRepository: { getAll: () => [], getByRentalId: () => [] } }));
vi.mock("@/features/rental/deur/shift-window/repository", () => ({ deurShiftWindowRepository: { getAll: () => [] } }));
vi.mock("@/features/rental/deur/compliance/buildRentalDeurComplianceReport", () => ({ buildRentalDeurComplianceReport: () => ({ monitored: [], rows: [] }) }));
vi.mock("@/features/rental/components/RentalDeurExceptionsSection", () => ({ default: () => createElement("div", null, "DEUR-specific filters") }));
vi.mock("@/features/rental/components/RentalListPresentation", () => ({ RentalMobileCard: ({ rental }: { rental: { rentalNumber: string } }) => createElement("article", null, rental.rentalNumber) }));
vi.mock("@/features/rental/collections/repository", () => ({ collectionRepository: { getByStatementId: () => [] } }));

const roots: Root[] = [];
function LocationProbe() { const location = useLocation(); return createElement("output", { "aria-label": "Location" }, location.pathname + location.search); }
afterEach(async () => { while (roots.length) await act(async () => roots.pop()?.unmount()); });

describe("Rental page workspace UX", () => {
  it("shows shared filters in each tab and opens the correct workspace from a whole row", async () => {
    const container = document.createElement("div");
    const root = createRoot(container); roots.push(root);
    await act(async () => root.render(createElement(MemoryRouter, { initialEntries: ["/rentals?r_customer=customer-1"] }, createElement(RentalPage), createElement(LocationProbe))));
    expect(container.querySelector('input[aria-label="Search rentals"]')).not.toBeNull();
    expect(container.querySelector('select[aria-label="Project filter"]')?.textContent).toContain("P-7 - Pier Works");
    expect(container.querySelectorAll('tr[aria-label="Open rental RNT-001"]')).toHaveLength(1);
    expect(container.querySelector("table")?.className).toContain("table-fixed");
    expect(container.querySelector("table")?.closest(".overflow-x-auto")).toBeNull();
    expect(container.querySelector("table")?.textContent).not.toContain("Open Workspace");
    const status = container.querySelector<HTMLSelectElement>('select[aria-label="Status filter"]')!;
    await act(async () => { status.value = "Active"; status.dispatchEvent(new Event("change", { bubbles: true })); });
    expect(container.querySelector('output[aria-label="Location"]')?.textContent).toContain("r_status=Active");
    await act(async () => container.querySelector<HTMLButtonElement>('button[role="tab"][aria-selected="false"]')?.click());
    expect(container.querySelector('input[aria-label="Search rentals"]')).not.toBeNull();
    expect(container.querySelector('output[aria-label="Location"]')?.textContent).toContain("view=engagements");
    await act(async () => [...container.querySelectorAll<HTMLButtonElement>('button[role="tab"]')].find((tab) => tab.textContent?.includes("DEUR Exceptions"))?.click());
    expect(container.querySelector('input[aria-label="Search rentals"]')).not.toBeNull();
    expect(container.textContent).toContain("DEUR-specific filters");
    await act(async () => [...container.querySelectorAll<HTMLButtonElement>('button[role="tab"]')].find((tab) => tab.textContent?.includes("All Rentals"))?.click());
    await act(async () => container.querySelector<HTMLTableRowElement>('tr[aria-label="Open rental RNT-001"]')?.querySelector("td")?.click());
    expect(container.querySelector('output[aria-label="Location"]')?.textContent).toContain("/rentals/rental-1/workspace");
    expect(container.querySelector('output[aria-label="Location"]')?.textContent).toContain("listQuery=");
  });

  it("opens the correct Rental workspace with the keyboard", async () => {
    const container = document.createElement("div");
    const root = createRoot(container); roots.push(root);
    await act(async () => root.render(createElement(MemoryRouter, { initialEntries: ["/rentals"] }, createElement(RentalPage), createElement(LocationProbe))));
    const row = container.querySelector<HTMLTableRowElement>('tr[aria-label="Open rental RNT-001"]')!;
    await act(async () => row.dispatchEvent(new KeyboardEvent("keydown", { key: " ", bubbles: true })));
    expect(container.querySelector('output[aria-label="Location"]')?.textContent).toContain("/rentals/rental-1/workspace");
  });
});
