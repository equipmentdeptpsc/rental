import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ApplicationDependencyContext } from "@/app/composition/dependencyContext";
import { PersistenceMode, type ApplicationDependencies } from "@/app/composition/ApplicationDependencies";
import RentalEquipmentLineReturnActions from "@/features/rental/components/RentalEquipmentLineReturnActions";
import type { AssignmentRecord } from "@/features/assignment/types";
import type { EquipmentRecord } from "@/features/equipment/types";
import type { Operator } from "@/features/operators/types";
import type { RentalRecord } from "@/features/rental/types";

const mocks = vi.hoisted(() => ({ toast: vi.fn(), refresh: vi.fn() }));
vi.mock("@/features/auth/AuthContext", () => ({ useAuth: () => ({ hasPermission: (permission: string) => permission === "rental.return" }) }));
vi.mock("@/components/ui/toast/ToastContext", () => ({ useToast: () => ({ showToast: mocks.toast }) }));
vi.mock("@/features/rental/remote/canonicalRentalRefresh", () => ({ requestCanonicalRentalRefresh: mocks.refresh }));

const roots: Root[] = [];
const rental = { id: "rental-1", status: "Active", dateOut: "2026-10-01", deurExpectationPolicy: { frequency: "PER_WORKDAY", effectiveFrom: "2026-10-01", timezone: "Asia/Manila", capturedAt: "2026-10-01T00:00:00.000Z" } } as RentalRecord;
const lines = [
  { id: "line-return", rentalId: rental.id, equipmentId: "equipment-1", assignmentId: "assignment-1", operatorId: "operator-1", status: "Active", rowVersion: 9, createdAt: "", updatedAt: "" },
  { id: "line-active", rentalId: rental.id, equipmentId: "equipment-2", assignmentId: "assignment-2", operatorId: "operator-2", status: "Active", rowVersion: 10, createdAt: "", updatedAt: "" },
  { id: "line-returned", rentalId: rental.id, equipmentId: "equipment-3", assignmentId: "assignment-3", operatorId: "operator-3", status: "Returned", actualReturnDate: "2026-10-03", rowVersion: 11, createdAt: "", updatedAt: "" },
] as const;

function dependencies(returnLine = vi.fn(async () => ({ success: true, disposition: "ACCEPTED", serverOccurredAt: "2026-10-04T00:00:00.000Z", refresh: [], value: { rentalId: rental.id, rentalLineId: "line-return", status: "Returned", version: 10, actualReturnDate: "2026-10-04" } } as const))) {
  return {
    configuration: { persistenceMode: PersistenceMode.Remote, equipmentStatusSource: "supabase", remoteOperationalWritesEnabled: false, remoteRentalReturnEnabled: true },
    commandRepositories: { rentalReturnCommands: { returnLine, returnAll: vi.fn(), getReturnReadiness: vi.fn() } },
  } as unknown as ApplicationDependencies;
}

async function render(input = dependencies()) {
  const container = document.createElement("div"), root = createRoot(container); roots.push(root);
  await act(async () => root.render(createElement(ApplicationDependencyContext.Provider, { value: input }, createElement(RentalEquipmentLineReturnActions, {
    rental, lines: [...lines], equipment: [
      { id: "equipment-1", assetNo: "EQ-001", equipmentName: "Excavator" },
      { id: "equipment-2", assetNo: "EQ-002", equipmentName: "Loader" },
      { id: "equipment-3", assetNo: "EQ-003", equipmentName: "Crane" },
    ] as unknown as EquipmentRecord[], assignments: [
      { id: "assignment-1", status: "Active" }, { id: "assignment-2", status: "Active" }, { id: "assignment-3", status: "Completed" },
    ] as unknown as AssignmentRecord[], operators: [
      { id: "operator-1", name: "Juan Dela Cruz" }, { id: "operator-3", name: "Pedro Santos" },
    ] as unknown as Operator[],
  }))));
  return container;
}

beforeEach(() => { vi.clearAllMocks(); vi.useFakeTimers(); vi.setSystemTime(new Date("2026-10-03T18:00:00.000Z")); });
afterEach(() => { vi.useRealTimers(); });
afterEach(async () => { while (roots.length) await act(async () => roots.pop()?.unmount()); });

describe("canonical per-line return controls", () => {
  it("renders business equipment and operator identifiers without exposing UUIDs", async () => {
    const container = await render();
    expect(container.textContent).toContain("Excavator");
    expect(container.textContent).toContain("EQ-001");
    expect(container.textContent).toContain("Juan Dela Cruz");
    expect(container.textContent).toContain("Loader");
    expect(container.textContent).toContain("Unassigned");
    expect(container.textContent).toContain("Crane");
    expect(container.textContent).toContain("EQ-003");
    expect(container.textContent).toContain("Pedro Santos");
    expect(container.textContent).toContain("Line status: Active");
    expect(container.textContent).toContain("Assignment: Active");
    expect(container.textContent).toContain("Line status: Returned");
    expect(container.textContent).toContain("Actual return date: 2026-10-03");
    expect(container.textContent).not.toContain("equipment-1");
    expect(container.textContent).not.toContain("operator-1");
  });

  it("confirms one selected active line, sends its versioned canonical command, and keeps other lines untouched", async () => {
    const returnLine = vi.fn(async () => ({ success: true, disposition: "ACCEPTED", serverOccurredAt: "2026-10-04T00:00:00.000Z", refresh: [], value: { rentalId: rental.id, rentalLineId: "line-return", status: "Returned", version: 10, actualReturnDate: "2026-10-04" } } as const));
    const container = await render(dependencies(returnLine));
    expect(container.textContent).toContain("Actual return date: 2026-10-03");
    const buttons = [...container.querySelectorAll("button")].filter((item) => item.textContent === "Return Equipment");
    expect(buttons).toHaveLength(2);
    await act(async () => { buttons[0].click(); await Promise.resolve(); });
    expect(container.textContent).toContain("Return EQ-001?");
    expect(container.textContent).not.toContain("October 4, 2026");
    const confirm = [...container.querySelectorAll("button")].filter((item) => item.textContent === "Return Equipment")[2];
    await act(async () => { confirm.click(); confirm.click(); await Promise.resolve(); });
    expect(returnLine).toHaveBeenCalledTimes(1);
    expect(returnLine).toHaveBeenCalledWith(expect.objectContaining({ rentalId: rental.id, rentalLineId: "line-return", equipmentId: "equipment-1", assignmentId: "assignment-1", expectedVersion: 9, actualReturnDate: "2026-10-04" }));
    expect(mocks.refresh).toHaveBeenCalledTimes(1);
  });
});
