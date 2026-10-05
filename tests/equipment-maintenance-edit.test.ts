import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  update: vi.fn(async (_command: unknown) => ({ success: true as const, disposition: "ACCEPTED" as const, serverOccurredAt: "2026-10-06T00:00:00Z", refresh: ["equipment-1"], value: { id: "equipment-1", maintenanceType: "Both" as const, rowVersion: 4 } })),
  retry: vi.fn(),
}));
vi.mock("@/app/composition", () => ({ useApplicationDependenciesCompatibility: () => ({ commandRepositories: { canonicalEquipment: { updateMaintenanceType: state.update } } }) }));
vi.mock("@/features/auth/AuthContext", () => ({ useAuth: () => ({ hasPermission: (permission: string) => permission === "equipment.update" }) }));
vi.mock("@/features/equipment/hooks/useCanonicalEquipmentDetail", () => ({ useCanonicalEquipmentDetail: () => ({ equipment: { status: "ready", value: { id: "equipment-1", assetNo: "EQ-1", equipmentName: "Excavator", maintenanceType: "Engine Hours", rowVersion: 3 } }, retry: state.retry }) }));

import RemoteEquipmentMaintenanceEdit from "@/features/equipment/components/RemoteEquipmentMaintenanceEdit";

let root: Root | undefined;
afterEach(async () => { if (root) await act(async () => root?.unmount()); root = undefined; vi.clearAllMocks(); });

describe("remote Equipment Maintenance Type edit", () => {
  it("shows the normalized historical selection and saves only Maintenance Type with version", async () => {
    const container = document.createElement("div");
    root = createRoot(container);
    await act(async () => root?.render(createElement(MemoryRouter, { initialEntries: ["/equipment/edit/equipment-1"] }, createElement(Routes, null, createElement(Route, { path: "/equipment/edit/:id", element: createElement(RemoteEquipmentMaintenanceEdit) })))));
    const selector = container.querySelector("select") as HTMLSelectElement;
    expect([...selector.options].map((option) => option.value)).toEqual(["Hour Meter", "Mileage", "None", "Both"]);
    expect(selector.value).toBe("Hour Meter");
    await act(async () => { selector.value = "Both"; selector.dispatchEvent(new Event("change", { bubbles: true })); });
    await act(async () => { [...container.querySelectorAll("button")].find((button) => button.textContent?.includes("Save Maintenance"))?.dispatchEvent(new MouseEvent("click", { bubbles: true })); await Promise.resolve(); });
    expect(state.update).toHaveBeenCalledWith(expect.objectContaining({ equipmentId: "equipment-1", expectedVersion: 3, maintenanceType: "Both" }));
    expect(Object.keys(state.update.mock.calls[0][0] as object).sort()).toEqual(["commandId", "equipmentId", "expectedVersion", "idempotencyKey", "maintenanceType"]);
  });
});
