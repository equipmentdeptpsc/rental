import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  mode: "remote",
  remoteReads: vi.fn(),
  localReads: vi.fn(),
  billingReads: vi.fn(),
  remoteStatus: "loaded",
  financialPermission: false,
}));

vi.mock("@/app/composition", () => ({
  PersistenceMode: { Local: "local", Remote: "remote" },
  useApplicationDependenciesCompatibility: () => ({ configuration: { persistenceMode: state.mode } }),
}));
vi.mock("@/features/auth/AuthContext", () => ({ useAuth: () => ({ hasPermission: (permission: string) => permission === "billing.read" || permission === "collections.read" ? state.financialPermission : permission !== "users.manage" }) }));
vi.mock("@/features/dashboard/hooks/useDashboardViewModel", () => ({ useDashboardViewModel: (key: number) => { state.localReads(key); return model; } }));
vi.mock("@/features/dashboard/hooks/useCanonicalDashboardViewModel", () => ({ useCanonicalDashboardViewModel: (key: number, audit: boolean, finance: boolean) => { state.remoteReads(key, audit, finance); return state.remoteStatus === "loaded" ? { status: "loaded", model: { ...model, financialAvailable: finance, activityAvailable: false }, loadedAt: new Date("2026-10-05T00:00:00Z") } : state.remoteStatus === "error" ? { status: "error", message: "Dashboard read failed" } : { status: "loading" }; } }));

import Dashboard from "@/pages/Dashboard";

const model = {
  operational: { totalEquipment: 1, activeRentals: 1 },
  financial: { upcoming: { scheduledRelease: 0, expectedReturns: 0, pendingManagerApprovals: 0, pendingCustomerAcknowledgements: 0 }, revenue: { billed: 0, collected: 0, outstanding: 0 }, collectionPerformance: { collectionRate: 0 } },
  fleetUtilization: { total: 1, available: 1, assigned: 0, deployed: 0, maintenance: 0 },
  utilizationRate: 0, pendingDeur: 0, actionQueue: [], activity: [], recentEquipmentActivity: [],
  managementSource: { equipment: [], assignments: [], rentals: [], rentalLines: [], projects: [], deurs: [], statements: [], collections: [] },
  billingVisibility: { readyForBilling: 0, blockers: {}, blockerCount: 0 },
};

const roots: Root[] = [];
afterEach(async () => { while (roots.length) await act(async () => roots.pop()?.unmount()); vi.clearAllMocks(); state.mode = "remote"; state.remoteStatus = "loaded"; state.financialPermission = false; });

async function render() {
  const node = document.createElement("div");
  const root = createRoot(node); roots.push(root);
  await act(async () => root.render(createElement(MemoryRouter, null, createElement(Dashboard))));
  return node;
}

describe("dashboard mode and refresh", () => {
  it("uses the remote path and refreshes the canonical read key", async () => {
    const node = await render();
    expect(state.remoteReads).toHaveBeenCalledWith(0, false, false);
    expect(state.localReads).not.toHaveBeenCalled();
    await act(async () => (node.querySelector('[aria-label="Refresh dashboard"]') as HTMLButtonElement).click());
    expect(state.remoteReads).toHaveBeenCalledWith(1, false, false);
    expect(node.textContent).toContain("Recent activity is unavailable for this account.");
    expect(node.querySelector('[aria-label="Analysis period"]')).not.toBeNull();
    expect(node.querySelector('[aria-label="Comparison period"]')).not.toBeNull();
    expect(node.querySelector('a[href="/rentals?r_status=Active"]')).not.toBeNull();
    expect(node.textContent?.toLowerCase()).not.toContain("canonical");
    expect(node.textContent).not.toContain("Invoiced amount & collections");
  });

  it("shows financial totals only with billing and collection read permissions", async () => {
    state.financialPermission = true;
    const node = await render();
    expect(state.remoteReads).toHaveBeenCalledWith(0, false, true);
    expect(node.textContent).toContain("Invoiced amount & collections");
    expect(node.textContent).toContain("Invoiced amount");
    expect(node.textContent).toContain("Top customers");
    expect(node.textContent).toContain("Top projects");
    expect(node.textContent).toContain("Equipment requiring attention");
  });

  it("retains the legacy local view model", async () => {
    state.mode = "local";
    await render();
    expect(state.localReads).toHaveBeenCalledWith(0);
    expect(state.remoteReads).not.toHaveBeenCalled();
  });

  it("shows loading and read errors without rendering zero metrics", async () => {
    state.remoteStatus = "loading";
    const node = await render();
    expect(node.textContent).toContain("Loading dashboard");
    expect(node.textContent?.toLowerCase()).not.toContain("canonical");
    expect(node.textContent).not.toContain("Active rentals");
    state.remoteStatus = "error";
    await act(async () => roots[roots.length - 1].render(createElement(MemoryRouter, null, createElement(Dashboard))));
    expect(node.querySelector('[role="alert"]')?.textContent).toContain("Dashboard read failed");
    expect(node.textContent?.toLowerCase()).not.toContain("canonical");
    expect(node.textContent).not.toContain("Active rentals");
  });
});
