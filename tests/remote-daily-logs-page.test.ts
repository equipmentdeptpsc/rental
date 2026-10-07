import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ mode: "remote", status: "loaded", reads: vi.fn(), rentalAccess: true }));
vi.mock("@/app/composition", () => ({ PersistenceMode: { Remote: "remote", Local: "local" }, useApplicationDependenciesCompatibility: () => ({ configuration: { persistenceMode: state.mode } }) }));
vi.mock("@/features/auth/AuthContext", () => ({ useAuth: () => ({ hasPermission: (permission: string) => permission === "rental.read" && state.rentalAccess }) }));
vi.mock("@/features/daily-log/hooks/useRemoteDailyLogs", () => ({ useRemoteDailyLogs: (key: number) => {
  state.reads(key);
  return state.status === "loaded" ? { status: "loaded", model } : state.status === "empty" ? { status: "loaded", model: { rows: [], total: 0, today: 0, equipmentLogged: 0, awaitingReview: 0 } } : state.status === "error" ? { status: "error", message: "DEUR read failed" } : { status: state.status };
} }));
vi.mock("@/pages/DailyLogs/New", () => ({ default: () => createElement("p", null, "Legacy form") }));

import DailyLogs from "@/pages/DailyLogs";
import DailyLogNewRoute from "@/pages/DailyLogs/NewRoute";

const row = {
  id: "d1", workDate: "2026-10-05", deurNumber: "DEUR-001", equipment: "EQ-01 · Excavator", operator: "Ana Operator", project: "North Site",
  rental: "RENT-01", rentalId: "r1", rentalEquipmentLine: "Line line-123", shift: "Day", status: "Submitted", revision: "R2",
  activity: "Operation 1h · Idle 0m", meter: "Hour meter 100 → 101", searchText: "deur-001 eq-01 excavator ana operator north site rent-01 submitted day",
};
const model = { rows: [row], total: 1, today: 1, equipmentLogged: 1, awaitingReview: 1 };
const roots: Root[] = [];
afterEach(async () => { while (roots.length) await act(async () => roots.pop()?.unmount()); vi.clearAllMocks(); state.mode = "remote"; state.status = "loaded"; state.rentalAccess = true; });

async function render(element = createElement(DailyLogs), initialPath = "/") {
  const node = document.createElement("div");
  const root = createRoot(node); roots.push(root);
  await act(async () => root.render(createElement(MemoryRouter, { initialEntries: [initialPath] }, element)));
  return node;
}

describe("remote Daily Logs page", () => {
  it("renders the DEUR field view with safe linked destination and no legacy write controls", async () => {
    const node = await render();
    expect(node.textContent).toContain("Daily equipment activity recorded through DEUR.");
    expect(node.textContent).toContain("DEUR-001");
    expect(node.textContent).toContain("EQ-01 · Excavator");
    expect(node.textContent).toContain("R2");
    expect(node.querySelector('a[href="/rentals/r1/workspace"]')).not.toBeNull();
    expect(node.textContent).not.toContain("New Daily Log");
    expect(node.textContent).not.toContain("Edit");
    expect(node.textContent).not.toContain("Delete");
    expect(node.textContent?.toLowerCase()).not.toContain("canonical");
    expect(state.reads).toHaveBeenCalledWith(0);
  });

  it("filters rows and hides the Rental link without destination permission", async () => {
    state.rentalAccess = false;
    const node = await render();
    expect(node.textContent).toContain("Rental access required");
    expect(node.querySelector('a[href="/rentals/r1/workspace"]')).toBeNull();
    await act(async () => { const field = node.querySelector('input[aria-label="Search Daily Logs"]') as HTMLInputElement; Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(field, "missing"); field.dispatchEvent(new Event("input", { bubbles: true })); });
    expect(node.textContent).toContain("No matching Daily Logs");
    await act(async () => { const field = node.querySelector('input[aria-label="Search Daily Logs"]') as HTMLInputElement; Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(field, ""); field.dispatchEvent(new Event("input", { bubbles: true })); });
    expect(node.textContent).toContain("DEUR-001");
    // Date filtering remains available even when the account cannot open a Rental.
    await act(async () => { const field = node.querySelector('input[aria-label="Filter work date"]') as HTMLInputElement; Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(field, "2026-10-04"); field.dispatchEvent(new Event("change", { bubbles: true })); });
    expect(node.textContent).toContain("No matching Daily Logs");
  });

  it("shows loading, error with Retry, and a genuine empty state", async () => {
    state.status = "loading";
    const node = await render();
    expect(node.querySelector('[role="status"]')?.textContent).toContain("Loading Daily Logs");
    expect(node.textContent).not.toContain("Effective DEURs");
    state.status = "error";
    await act(async () => roots[roots.length - 1].render(createElement(MemoryRouter, null, createElement(DailyLogs))));
    expect(node.querySelector('[role="alert"]')?.textContent).toContain("Daily Logs could not be loaded");
    expect(node.textContent?.toLowerCase()).not.toContain("canonical");
    expect(node.textContent).not.toContain("Effective DEURs");
    await act(async () => (node.querySelector('[role="alert"] button') as HTMLButtonElement).click());
    expect(state.reads).toHaveBeenCalledWith(1);
    state.status = "empty";
    await act(async () => roots[roots.length - 1].render(createElement(MemoryRouter, null, createElement(DailyLogs))));
    expect(node.textContent).toContain("No Daily Logs yet");
    expect(node.textContent).not.toContain("DEUR-001");
  });

  it("preserves the local placeholder and routes remote new requests back to the read view", async () => {
    state.mode = "local";
    const local = await render();
    expect(local.textContent).toContain("Daily Logs Management Module");
    expect(state.reads).not.toHaveBeenCalled();
    state.mode = "remote";
    const remoteNew = await render(createElement(Routes, null,
      createElement(Route, { path: "/daily-logs/new", element: createElement(DailyLogNewRoute) }),
      createElement(Route, { path: "/daily-logs", element: createElement("p", null, "Remote Daily Logs") }),
    ), "/daily-logs/new");
    expect(remoteNew.textContent).toContain("Remote Daily Logs");
    expect(remoteNew.textContent).not.toContain("Legacy form");
    state.mode = "local";
    const localNew = await render(createElement(Routes, null,
      createElement(Route, { path: "/daily-logs/new", element: createElement(DailyLogNewRoute) }),
    ), "/daily-logs/new");
    expect(localNew.textContent).toContain("Legacy form");
  });
});
