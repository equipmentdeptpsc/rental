import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApplicationDependencyProvider, createLocalApplicationDependencies, PersistenceMode } from "@/app/composition";
import { repositorySuccess } from "@/core/persistence";
import RemoteCommercialTermsPage from "@/features/rental/remote/RemoteCommercialTermsPage";

vi.mock("@/features/auth/AuthContext", () => ({ useAuth: () => ({ hasPermission: () => true }) }));
vi.mock("@/features/rental/context/RentalContext", () => ({ useRental: () => ({ rentals: [], rentalEquipmentLines: [] }) }));
vi.mock("@/features/assignment/context/AssignmentContext", () => ({ useAssignment: () => ({ assignments: [] }) }));
vi.mock("@/features/equipment/context/EquipmentContext", () => ({ useEquipment: () => ({ equipment: [] }) }));
vi.mock("@/features/operators/context/OperatorContext", () => ({ useOperator: () => ({ operators: [] }) }));
vi.mock("@/features/project/context/ProjectContext", () => ({ useProject: () => ({ projects: [] }) }));
vi.mock("@/features/customer/context/CustomerContext", () => ({ useCustomer: () => ({ customers: [] }) }));

const page = <T,>(items: T[]) => repositorySuccess({ items, nextCursor: undefined });
let root: Root;
let container: HTMLDivElement;
let version: number;
let activityCodeId: string;
let updateTerms: ReturnType<typeof vi.fn>;

async function render() {
  const dependencies = createLocalApplicationDependencies();
  dependencies.readRepositories.rentals.list = vi.fn(async () => page([{ id: "rental-1", rentalNumber: "R-1", status: "Draft", rentalType: "Operated Rental", rowVersion: version, dateOut: "2026-10-08" }] as never));
  dependencies.readRepositories.rentalEquipmentLines.list = vi.fn(async () => page([{ id: "line-1", rentalId: "rental-1", assignmentId: "assignment-1", equipmentId: "equipment-1", operatorId: "operator-1", status: "Draft" }] as never));
  dependencies.readRepositories.equipment.list = vi.fn(async () => page([{ id: "equipment-1", assetNo: "EQ-1", equipmentName: "Excavator", costCodeId: "cost-1", maintenanceType: "Hour Meter" }] as never));
  dependencies.readRepositories.assignments.list = vi.fn(async () => page([{ id: "assignment-1", operatorId: "operator-1", equipmentId: "equipment-1", activityCodeId, status: "Active" }] as never));
  dependencies.readRepositories.operators.list = vi.fn(async () => page([]));
  dependencies.readRepositories.projects.list = vi.fn(async () => page([]));
  dependencies.readRepositories.customers.list = vi.fn(async () => page([]));
  dependencies.readRepositories.workDescriptions.list = vi.fn(async () => page([{ id: "work-1", code: "WORK", name: "Excavation", active: true }] as never));
  container = document.createElement("div");
  root = createRoot(container);
  await act(async () => {
    root.render(createElement(ApplicationDependencyProvider, {
      dependencies: {
        ...dependencies,
        configuration: { ...dependencies.configuration, persistenceMode: PersistenceMode.Remote, remoteOperationalWritesEnabled: true, remoteRentalCommercialTermsEnabled: true },
        commandRepositories: { ...dependencies.commandRepositories, canonicalRental: {
          readWorkspace: vi.fn(async () => ({ success: true, value: { rentalId: "rental-1", contracts: [], commercialSnapshots: [] } })),
          readReferenceData: vi.fn(async () => ({ success: true, value: { costCodes: [{ id: "cost-1", code: "COST", name: "Equipment cost", active: true, sortOrder: 0 }], activityCodes: [{ id: "activity-1", code: "ACT-1", name: "Excavation", active: true, sortOrder: 0 }, { id: "activity-2", code: "ACT-2", name: "Other work", active: true, sortOrder: 1 }] } })),
          updateTerms,
        } as never },
      },
    }, createElement(MemoryRouter, null, createElement(RemoteCommercialTermsPage, { rentalId: "rental-1" }))));
    await Promise.resolve();
  });
}

async function setField(label: string, value: string) {
  const field = [...container.querySelectorAll("label")].find(item => item.textContent?.startsWith(label));
  const input = field?.querySelector("input,select") as HTMLInputElement | HTMLSelectElement | null;
  if (!input) throw new Error(`Missing ${label}`);
  await act(async () => {
    Object.getOwnPropertyDescriptor(input instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype, "value")?.set?.call(input, value);
    input.dispatchEvent(new Event(input instanceof HTMLSelectElement ? "change" : "input", { bubbles: true }));
  });
}

async function completeAndSave() {
  await setField("Unit Rate", "750");
  await setField("VAT Rate", "12");
  await setField("Work Description", "work-1");
  await act(async () => { container.querySelector("button")?.dispatchEvent(new MouseEvent("click", { bubbles: true })); await Promise.resolve(); });
}

beforeEach(() => { version = 1; activityCodeId = "activity-1"; updateTerms = vi.fn(async () => ({ success: true, disposition: "ACCEPTED", value: { rentalId: "rental-1", status: "Draft", version: version + 1 } })); });
afterEach(async () => { if (root) await act(async () => root.unmount()); });

describe("remote DEUR preparation references", () => {
  it("saves the current rental with codes from its linked Equipment and Assignment", async () => {
    await render();
    expect(container.textContent).toContain("Equipment cost");
    expect(container.textContent).toContain("Excavation");
    expect(container.textContent).not.toContain("Other work");
    await completeAndSave();
    expect(updateTerms).toHaveBeenCalledTimes(1);
    expect(updateTerms.mock.calls[0][0]).toMatchObject({ rentalId: "rental-1", expectedVersion: 1, lines: [{ lineId: "line-1", costCodeId: "cost-1", activityCodeId: "activity-1", workDescriptionId: "work-1" }] });
  });

  it("keeps stale version rejection and saves after an authoritative refresh", async () => {
    updateTerms.mockImplementationOnce(async () => { version = 2; return { success: false, code: "CONFLICT", message: "Rental changed; refresh.", currentVersion: 2 }; });
    await render(); await completeAndSave();
    expect(container.textContent).toContain("Rental changed; refresh.");
    await act(async () => { await Promise.resolve(); });
    await act(async () => { container.querySelector("button")?.dispatchEvent(new MouseEvent("click", { bubbles: true })); await Promise.resolve(); });
    expect(updateTerms).toHaveBeenCalledTimes(2);
    expect(updateTerms.mock.calls[1][0].expectedVersion).toBe(2);
    expect(updateTerms.mock.calls[1][0].idempotencyKey).not.toBe(updateTerms.mock.calls[0][0].idempotencyKey);
  });

  it("refreshes a changed Assignment reference and reuses no failed command identity", async () => {
    updateTerms.mockImplementationOnce(async () => { activityCodeId = "activity-2"; return { success: false, code: "MISSING_RELATIONSHIP", message: "Reference changed; refresh." }; });
    await render(); await completeAndSave();
    expect(container.textContent).toContain("Reference changed; refresh.");
    await act(async () => { await Promise.resolve(); });
    await act(async () => { container.querySelector("button")?.dispatchEvent(new MouseEvent("click", { bubbles: true })); await Promise.resolve(); });
    expect(updateTerms).toHaveBeenCalledTimes(2);
    expect(updateTerms.mock.calls[1][0].lines[0]).toMatchObject({ lineId: "line-1", activityCodeId: "activity-2" });
    expect(updateTerms.mock.calls[1][0].idempotencyKey).not.toBe(updateTerms.mock.calls[0][0].idempotencyKey);
  });

  it("rejects a missing linked Activity Code before sending a preparation command", async () => {
    activityCodeId = "";
    await render(); await completeAndSave();
    expect(updateTerms).not.toHaveBeenCalled();
    expect(container.textContent).toContain("linked Equipment Cost Code or Assignment Activity Code is unavailable");
  });

  it("submits once while the first save is still pending", async () => {
    let resolve: ((value: unknown) => void) | undefined;
    updateTerms.mockImplementation(() => new Promise(value => { resolve = value; }));
    await render();
    await setField("Unit Rate", "750"); await setField("VAT Rate", "12"); await setField("Work Description", "work-1");
    const save = [...container.querySelectorAll("button")].find(item => item.textContent === "Save Preparation");
    await act(async () => { save?.click(); save?.click(); await Promise.resolve(); });
    expect(updateTerms).toHaveBeenCalledTimes(1);
    await act(async () => { resolve?.({ success: true, disposition: "ACCEPTED", value: { rentalId: "rental-1", status: "Draft", version: 2 } }); await Promise.resolve(); });
  });
});
