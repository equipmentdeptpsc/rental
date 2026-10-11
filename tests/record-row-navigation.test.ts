import { act, createElement, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, useLocation } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ResponsiveEquipmentTable } from "@/pages/Equipment";
import { BookingList } from "@/features/booking/components/CanonicalBookingOperationsWorkspace";
import { RentalMobileCard } from "@/features/rental/components/RentalListPresentation";
import { useRecordNavigation } from "@/shared/navigation/useRecordNavigation";

vi.mock("@/features/rental/components/RentalQuickActions", () => ({ default: () => createElement("button", { type: "button" }, "Other action") }));
vi.mock("@/features/rental/approval/ApprovalInvalidationNotice", () => ({ default: () => null }));

const roots: Root[] = [];
afterEach(async () => { while (roots.length) await act(async () => roots.pop()?.unmount()); });

function Probe() { return createElement("output", { "data-route": true }, useLocation().pathname); }
async function render(content: ReactNode) {
  const node = document.createElement("div");
  const root = createRoot(node);
  roots.push(root);
  await act(async () => root.render(createElement(MemoryRouter, { initialEntries: ["/listing"] }, createElement("div", null, createElement(Probe), content))));
  return { node, path: () => node.querySelector("[data-route]")?.textContent };
}
async function click(target: Element) { await act(async () => target.dispatchEvent(new MouseEvent("click", { bubbles: true, button: 0 }))); }
async function key(target: Element, value: string) { await act(async () => target.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: value }))); }

function InteractiveRow() {
  const navigateToRecord = useRecordNavigation();
  const props = navigateToRecord("/details/read-only", "View record");
  return createElement("div", props, "Record", createElement("button", { type: "button" }, "Edit"), createElement("input", { "aria-label": "Filter" }));
}

describe("record row navigation", () => {
  it("opens Equipment Details from the row and supports Enter", async () => {
    const item = { id: "equipment 1", assetNo: "EQ-1", equipmentName: "Crane", category: "Heavy", statusLabel: "Available", active: true, deleted: false };
    const first = await render(createElement(ResponsiveEquipmentTable, { items: [item] as never }));
    const row = first.node.querySelector("tbody tr")!;
    expect(row.getAttribute("role")).toBe("link");
    expect(row.getAttribute("tabindex")).toBe("0");
    await click(row.querySelector("td")!);
    expect(first.path()).toBe("/equipment/equipment%201");
    const second = await render(createElement(ResponsiveEquipmentTable, { items: [item] as never }));
    await key(second.node.querySelector("tbody tr")!, "Enter");
    expect(second.path()).toBe("/equipment/equipment%201");
  });

  it("opens the Booking Rental Workspace from a non-action cell", async () => {
    const row = { rentalId: "rental 1", rentalNumber: "R-1", rentalEquipmentLineId: "line-1", equipmentId: "equipment-1", equipmentName: "Crane", dateOut: "2026-10-01", endDate: "2026-10-10", rentalStatus: "Active", createdAt: "2026-10-01", presentationStatus: "Checked out", overdue: false, conflict: false };
    const view = await render(createElement(BookingList, { rows: [row] as never }));
    await click(view.node.querySelector("tbody tr td:nth-child(2)")!);
    expect(view.path()).toBe("/rentals/rental%201/workspace");
  });

  it("opens Rental Workspace from a mobile card with Space", async () => {
    const rental = { id: "rental-2", rentalNumber: "R-2", status: "Active", dateOut: "2026-10-01", expectedReturn: "2026-10-10", customer: "Customer", project: "Project" };
    const view = await render(createElement(RentalMobileCard, { rental: rental as never, presentation: { equipmentLabel: "Crane", operatorLabel: "Operator" } as never, workflowLabel: "Active", collectionStatus: "Open", compliance: null }));
    await key(view.node.querySelector("article")!, " ");
    expect(view.path()).toBe("/rentals/rental-2/workspace");
  });

  it("does not hijack buttons, inputs, or non-primary clicks", async () => {
    const view = await render(createElement(InteractiveRow));
    const row = view.node.querySelector("button")!.parentElement!;
    expect(row.getAttribute("role")).toBe("link");
    await click(row.querySelector("button")!);
    await key(row.querySelector("button")!, "Enter");
    await click(row.querySelector("input")!);
    await act(async () => row.dispatchEvent(new MouseEvent("click", { bubbles: true, button: 1 })));
    expect(view.path()).toBe("/listing");
    await key(row, "Enter");
    expect(view.path()).toBe("/details/read-only");
  });
});
