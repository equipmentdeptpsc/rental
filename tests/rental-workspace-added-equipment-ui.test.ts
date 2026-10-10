import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

const permission = vi.hoisted(() => ({ preparation: false }));
vi.mock("@/features/auth/AuthContext", () => ({ useAuth: () => ({ hasPermission: (name: string) => permission.preparation && name === "rental.commercialTerms.update" }) }));
vi.mock("@/app/composition", async (original) => ({ ...(await original<object>()), useApplicationDependenciesCompatibility: () => ({ configuration: { persistenceMode: "remote", remoteRentalCommercialTermsEnabled: true }, commandRepositories: { canonicalRental: {} } }) }));
vi.mock("@/features/rental/remote/RemoteCommercialTermsPage", () => ({ default: () => createElement("p", null, "Inline canonical preparation") }));
vi.mock("@/features/rental/components/RentalQuickActions", () => ({ default: () => createElement("button", { type: "button" }, "Submit for Approval") }));

import AddedEquipmentStatusPanel from "@/features/rental/workspace/overview/sections/AddedEquipmentStatusPanel";
import type { RentalRecord } from "@/features/rental/types";
import type { RentalEquipmentLine } from "@/features/rental/equipment-line/types";

const rental = { id: "r-1", rentalNumber: "RNT-1", dateOut: "2026-10-08", expectedReturn: "2026-10-20", rentalType: "Operated Rental", status: "Draft", approvalStatus: "Rejected", approvalDecisionRemarks: "Missing terms" } as RentalRecord;
const lines = [
  { id: "line-1", rentalId: "r-1", equipmentId: "e-1", operatorId: "", status: "Draft", effectiveStartDate: "2026-10-10" },
  { id: "line-2", rentalId: "r-1", equipmentId: "e-2", operatorId: "operator-2", status: "Returned", effectiveStartDate: "2026-10-09" },
] as RentalEquipmentLine[];
const roots: Root[] = [];

async function render(lineItems = lines) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container); roots.push(root);
  await act(async () => root.render(createElement(AddedEquipmentStatusPanel, {
    rental, lines: lineItems,
    equipment: [{ id: "e-1", assetNo: "EQ-1", equipmentName: "Crane" }, { id: "e-2", assetNo: "EQ-2", equipmentName: "Loader" }] as never,
    assignments: [], operators: [{ id: "operator-2", name: "Operator Two" }] as never, contracts: [],
  })));
  await act(async () => container.querySelector<HTMLButtonElement>("button")?.click());
  return container;
}

afterEach(async () => { permission.preparation = false; while (roots.length) await act(async () => roots.pop()?.unmount()); document.body.innerHTML = ""; });

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
});
