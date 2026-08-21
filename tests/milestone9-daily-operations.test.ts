import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { RentalAggregate } from "@/features/rental/aggregate";
import type { RentalEquipmentLine } from "@/features/rental/equipment-line";
import type { DeurRecord } from "@/features/rental/deur/types";
import { buildRentalLineOperations, presentCurrentDeurActivity } from "@/features/rental/workspace/deur/buildRentalLineOperations";
import { canViewManagementOperationalSnapshot, ManagementOperationalSnapshot } from "@/features/rental/workspace/deur/RentalLineOperationsGrid";

const line = (id: string): RentalEquipmentLine => ({ id, rentalId: "rental-1", equipmentId: `equipment-${id}`, operatorId: `operator-${id}`, assignmentId: `assignment-${id}`, status: "Active", createdAt: "2026-08-21T00:00:00Z", updatedAt: "2026-08-21T00:00:00Z" });
const operatingDeur: DeurRecord = { id: "deur-1", deurNumber: "DEUR-2026-1", rentalId: "rental-1", rentalEquipmentLineId: "line-1", equipmentId: "equipment-line-1", operatorId: "operator-line-1", creationSource: "OPERATOR_DIGITAL", workDate: "2026-08-21", status: "In Progress", legacy: false, events: [{ id: "shift", activityType: "shift", action: "start", timestamp: "2026-08-21T08:00:00Z", sequence: 1, source: "user" }, { id: "operation", activityType: "operation", action: "start", timestamp: "2026-08-21T08:15:00Z", sequence: 2, source: "user" }], totals: { shiftMinutes: 60, operationMinutes: 45, idleMinutes: 0, standbyMinutes: 0, mealBreakMinutes: 0, breakdownMinutes: 0 }, logs: [], totalOperatingMinutes: 45, totalIdleMinutes: 0, totalMaintenanceMinutes: 0, totalMealBreakMinutes: 0, totalMobilizationMinutes: 0, totalDemobilizationMinutes: 0, createdAt: "2026-08-21T08:00:00Z", updatedAt: "2026-08-21T09:00:00Z" };

describe("Milestone 9 canonical Daily Operations", () => {
  it("uses the active Digital DEUR event stream as current activity authority", () => {
    const states = buildRentalLineOperations({ lines: [line("line-1")], deurs: [operatingDeur], evaluatedAt: "2026-08-21T09:00:00Z" });
    expect(states[0]).toMatchObject({ currentActivity: "Operating", issue: "No current operational issues.", priority: "normal" });
    expect(states[0].currentActivity).not.toContain("Waiting for operator");
    expect(presentCurrentDeurActivity("breakdown", true)).toBe("Breakdown");
  });

  it("reports a truthful no-DEUR state and preserves Rental line isolation", () => {
    const states = buildRentalLineOperations({ lines: [line("line-1"), line("line-2")], deurs: [operatingDeur], evaluatedAt: "2026-08-21T09:00:00Z" });
    expect(states[0].deur?.id).toBe("deur-1");
    expect(states[1]).toMatchObject({ deur: undefined, issue: "Operator has not started a DEUR for this equipment.", priority: "warning" });
  });

  it("removes competing production activity commands from Rental Operations", () => {
    const page = readFileSync("src/features/rental/workspace/deur/DeurPanel.tsx", "utf8");
    expect(page).not.toContain("<ActivityControls");
    expect(page).not.toContain("<DeurHoursEntry");
    expect(page).not.toContain("startActivity(");
    expect(readFileSync("src/features/rental/workspace/components/RentalWorkspaceTabs.tsx", "utf8")).toContain('"deur"');
  });

  it("restricts the management snapshot to Management and System Administrator personas", () => {
    expect(canViewManagementOperationalSnapshot(["management"])).toBe(true);
    expect(canViewManagementOperationalSnapshot(["system-administrator"])).toBe(true);
    expect(canViewManagementOperationalSnapshot(["operator"])).toBe(false);
    expect(canViewManagementOperationalSnapshot(["rental-operations"])).toBe(false);
  });

  it("renders canonical active and closed management financial snapshots", async () => {
    const aggregate = { rental: { id: "rental-1", customer: "Customer", project: "Project", rentedBy: "", dateOut: "2026-08-01", expectedReturn: "2026-08-21", statusId: "active", status: "Active" }, rentalEquipmentLines: [line("line-1")], deurs: [operatingDeur], billing: { totalOperatingCharge: 0, totalIdleCharge: 0, totalMobilizationCharge: 0, totalDemobilizationCharge: 0, totalAdjustment: 0, subtotal: 12000, invoiced: 12000, collected: 7000, outstanding: 5000, collectionStatus: "Partially Collected" } } as RentalAggregate;
    const states = buildRentalLineOperations({ lines: aggregate.rentalEquipmentLines, deurs: aggregate.deurs, evaluatedAt: "2026-08-21T09:00:00Z" });
    const container=document.createElement("div"),root=createRoot(container);
    await act(async()=>root.render(createElement(ManagementOperationalSnapshot,{aggregate,states})));
    expect(container.textContent).toContain("Currently Operating1");expect(container.textContent).toContain("₱5,000.00");
    await act(async()=>root.render(createElement(ManagementOperationalSnapshot,{aggregate:{...aggregate,rental:{...aggregate.rental,status:"Closed"}},states})));
    expect(container.textContent).toContain("Final read-only Rental snapshot");expect(container.textContent).toContain("Historical DEUR and return evidence remain read-only");
    await act(async()=>root.unmount());
  });
});
