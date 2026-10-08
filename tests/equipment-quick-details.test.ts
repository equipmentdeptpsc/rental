import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/features/auth/AuthContext", () => ({ useAuth: () => ({ hasPermission: () => true }) }));
vi.mock("@/features/masters/activity-code", () => ({ useActivityCodes: () => ({ records: [{ id: "activity-1", activityCode: "EARTHWORK" }] }) }));
vi.mock("@/features/equipment/hooks/useCanonicalEquipmentDetail", () => ({ useCanonicalEquipmentDetail: () => ({
  equipment: { status: "ready", value: { id: "eq-1", assetNo: "EQ-001", equipmentName: "Excavator", category: "Heavy", statusLabel: "Assigned", condition: "Good", location: "Depot", maintenanceType: "Hour meter", currentReading: 120 } },
  assignment: { status: "ready", value: { assignment: { assignedDate: "2026-10-08", expectedReturn: "2026-10-12", activityCodeId: "activity-1" }, operator: { name: "Juan" }, project: { projectName: "Site A" }, projectReadable: true, operatorReadable: true } },
  rental: { status: "ready", value: { rental: { rentalNumber: "R-101", status: "Active" }, customer: { companyName: "Customer A" }, customerReadable: true } },
  maintenance: { status: "ready", value: { openRecords: [] } }, recentDeurs: { status: "ready", value: [] }, retry: vi.fn(),
}) }));

import EquipmentQuickDetails from "@/features/equipment/components/EquipmentQuickDetails";

describe("equipment quick details", () => {
  it("shows operational read data and a full-detail action", async () => {
    const container = document.createElement("div"); document.body.appendChild(container);
    const root = createRoot(container);
    await act(async () => root.render(createElement(MemoryRouter, null, createElement(EquipmentQuickDetails, { id: "eq-1", onClose: vi.fn() }))));
    expect(container.querySelector('[role="dialog"]')?.getAttribute("aria-label")).toContain("EQ-001");
    for (const value of ["Juan", "Site A", "EARTHWORK", "R-101", "Depot", "Customer A"]) expect(container.textContent).toContain(value);
    expect(container.querySelector('a[href="/equipment/eq-1"]')).not.toBeNull();
    await act(async () => root.unmount()); container.remove();
  });
});
