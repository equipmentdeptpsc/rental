import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, useLocation } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApplicationDependencyProvider, createLocalApplicationDependencies, type ApplicationDependencies } from "@/app/composition";
import { repositorySuccess } from "@/core/persistence";
import type { CanonicalBookingListItem, CanonicalBookingPage } from "@/features/booking/canonical";
import CanonicalBookingOperationsWorkspace from "@/features/booking/components/CanonicalBookingOperationsWorkspace";

const permissions = vi.hoisted(() => new Set(["rental.read", "customer.read", "project.read", "equipment.read", "operator.read", "rental.commercialTerms.read"]));
vi.mock("@/features/auth/AuthContext", () => ({ useAuth: () => ({ hasPermission: (key: string) => permissions.has(key) }) }));
vi.mock("@/features/rental/components/RentalQuickActions", () => ({ default: () => createElement("button", { type: "button" }, "Existing rental actions") }));

const roots: Root[] = [];
const booking = (overrides: Partial<CanonicalBookingListItem> = {}): CanonicalBookingListItem => ({ rentalId: "rental-1", rentalNumber: "RB-001", rentalStatus: "Reserved", rentalEquipmentLineId: "line-1", equipmentId: "equipment-1", equipmentAssetNumber: "EX-12", equipmentName: "Excavator", customerId: "customer-1", customerName: "North Harbor", projectId: "project-1", projectName: "Pier Works", dateOut: "2026-10-08", expectedReturn: "2026-10-12", createdAt: "2026-10-01T01:00:00Z", ...overrides });
const rows = [booking(), booking({ rentalEquipmentLineId: "line-2", equipmentId: "equipment-2", equipmentAssetNumber: "TR-7", equipmentName: "Truck", rentalStatus: "Active" })];
const page = (items: CanonicalBookingListItem[], offset = 0, limit = 50): CanonicalBookingPage => ({ rows: items.slice(offset, offset + limit), totalCount: items.length, offset, limit, hasMore: offset + limit < items.length });

function dependencies(items = rows): ApplicationDependencies {
  const local = createLocalApplicationDependencies();
  const calendar = vi.fn(async (input: { windowStart: string; windowEnd: string; status?: string; customerId?: string; projectId?: string; equipmentId?: string; offset?: number; limit?: number }) => repositorySuccess(page(items.filter((row) => row.dateOut <= input.windowEnd && (!row.expectedReturn || row.expectedReturn >= input.windowStart) && (!input.status || row.rentalStatus === input.status) && (!input.customerId || row.customerId === input.customerId) && (!input.projectId || row.projectId === input.projectId) && (!input.equipmentId || row.equipmentId === input.equipmentId)), input.offset, input.limit)));
  const releases = vi.fn(async (input: { offset?: number; limit?: number }) => repositorySuccess(page(items.filter((row) => row.rentalStatus === "Reserved"), input.offset, input.limit)));
  const returns = vi.fn(async (input: { offset?: number; limit?: number }) => repositorySuccess(page(items.filter((row) => row.rentalStatus === "Active"), input.offset, input.limit)));
  const list = (items: unknown[]) => ({ list: vi.fn(async () => repositorySuccess({ items, nextCursor: undefined })) });
  return {
    ...local,
    readRepositories: {
      ...local.readRepositories,
      canonicalBookings: { searchCanonicalBookingCalendarRows: calendar, searchCanonicalBookingRows: vi.fn(async () => repositorySuccess(page(items))), searchCanonicalUpcomingReleaseRows: releases, searchCanonicalExpectedReturnRows: returns },
      customers: { ...local.readRepositories.customers, ...list([{ id: "customer-1", companyName: "North Harbor" }]) },
      projects: { ...local.readRepositories.projects, ...list([{ id: "project-1", projectCode: "P-1", projectName: "Pier Works", customerId: "customer-1" }, { id: "project-2", projectCode: "P-2", projectName: "Other Works", customerId: "customer-2" }]) },
      equipment: { ...local.readRepositories.equipment, ...list([{ id: "equipment-1", assetNo: "EX-12", equipmentName: "Excavator" }, { id: "equipment-2", assetNo: "TR-7", equipmentName: "Truck" }]), getById: vi.fn(async (id: string) => repositorySuccess({ id, assetNo: id === "equipment-1" ? "EX-12" : "TR-7", equipmentName: id === "equipment-1" ? "Excavator" : "Truck" })) },
      rentals: { ...local.readRepositories.rentals, getById: vi.fn(async () => repositorySuccess({ id: "rental-1", rentalNumber: "RB-001", status: "Reserved", customer: "North Harbor", project: "Pier Works", rentedBy: "", equipmentId: "equipment-1", dateOut: "2026-10-08", expectedReturn: "2026-10-12", statusId: "reserved", remarks: "Deliver at gate B", billingMethod: "Per Day", billingTerms: { unitRate: 100, vatApplicability: "Applicable" } })) },
      rentalEquipmentLines: { ...local.readRepositories.rentalEquipmentLines, ...list([{ id: "line-1", rentalId: "rental-1", equipmentId: "equipment-1", operatorId: "operator-1", assignmentId: "assignment-1", status: "Reserved", createdAt: "2026-10-01", updatedAt: "2026-10-01" }, { id: "line-2", rentalId: "rental-1", equipmentId: "equipment-2", operatorId: "", status: "Reserved", createdAt: "2026-10-01", updatedAt: "2026-10-01" }]) },
      operators: { ...local.readRepositories.operators, getById: vi.fn(async () => repositorySuccess({ id: "operator-1", name: "Ada Operator" })) },
    } as ApplicationDependencies["readRepositories"],
  };
}

function LocationProbe() { const location = useLocation(); return createElement("output", { "aria-label": "Current query" }, location.search); }
const setInput = async (input: HTMLInputElement, value: string) => act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value); input.dispatchEvent(new Event("input", { bubbles: true })); input.dispatchEvent(new Event("change", { bubbles: true })); });
async function render(initial = "/assignments", items = rows, deps = dependencies(items)) {
  const container = document.createElement("div");
  const root = createRoot(container); roots.push(root);
  await act(async () => root.render(createElement(ApplicationDependencyProvider, { dependencies: deps }, createElement(MemoryRouter, { initialEntries: [initial] }, createElement(CanonicalBookingOperationsWorkspace), createElement(LocationProbe)))));
  return { container, deps };
}
afterEach(async () => { while (roots.length) await act(async () => roots.pop()?.unmount()); permissions.add("rental.commercialTerms.read"); });

describe("Rental Bookings list workspace", () => {
  it("defaults to List, shows source-backed metrics, and retains alternate views", async () => {
    const { container } = await render();
    expect(container.querySelector('[role="tab"][aria-selected="true"]')?.textContent).toContain("List");
    expect(container.textContent).toContain("Total Bookings");
    expect(container.textContent).toContain("Equipment Reserved");
    expect(container.textContent).toContain("Releases Due");
    expect(container.textContent).toContain("Returns Due");
    expect([...container.querySelectorAll('[aria-label="Booking summary"] button')].map((card) => card.textContent)).toEqual(["Total Bookings2", "Equipment Reserved1", "Releases Due1", "Returns Due1"]);
    expect(container.querySelectorAll('tr[aria-label^="Open booking"]')).toHaveLength(2);
    expect(container.querySelector("table")?.parentElement?.parentElement?.className).toContain("overflow-auto");
    expect(container.querySelector("thead")?.className).toContain("sticky top-0");
    await act(async () => container.querySelector<HTMLButtonElement>('button[role="tab"]:nth-child(2)')?.click());
    expect(container.textContent).toContain("Calendar");
  });

  it("opens the shared drawer by row click and keyboard while nested links keep their action", async () => {
    const { container } = await render();
    const row = container.querySelector<HTMLTableRowElement>('tr[aria-label^="Open booking"]')!;
    await act(async () => row.querySelector<HTMLAnchorElement>("a")?.click());
    expect(container.querySelector('[role="dialog"]')).toBeNull();
    await act(async () => container.querySelector<HTMLTableRowElement>('tr[aria-label^="Open booking"]')?.querySelectorAll("td")[1]?.click());
    await vi.waitFor(() => expect(container.querySelector('[role="dialog"]')).not.toBeNull());
    await vi.waitFor(() => expect(container.querySelector('[role="dialog"]')?.textContent).toContain("TR-7"));
    expect(container.querySelector('[role="dialog"]')?.textContent).toContain("RB-001");
    expect(container.querySelector('[role="dialog"]')?.textContent).toContain("North Harbor");
    expect(container.querySelector('[role="dialog"]')?.textContent).toContain("Pier Works");
    expect(container.querySelector('[role="dialog"]')?.textContent).toContain("TR-7");
    expect(container.querySelector('[role="dialog"]')?.textContent).toContain("Commercial summary");
    await act(async () => container.querySelector<HTMLButtonElement>('button[aria-label="Close details"]')?.click());
    await act(async () => { container.querySelector<HTMLTableRowElement>('tr[aria-label^="Open booking"]')?.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "Enter" })); });
    expect(container.querySelector('[role="dialog"]')?.getAttribute("aria-hidden")).toBe("false");
  });

  it("keeps readable Customer and Project filters in the URL and clears them", async () => {
    const { container } = await render();
    const customer = container.querySelector<HTMLSelectElement>('select[aria-label="Customer"]')!;
    await act(async () => { customer.value = "customer-1"; customer.dispatchEvent(new Event("change", { bubbles: true })); });
    expect(container.querySelector('output[aria-label="Current query"]')?.textContent).toContain("b_customer=customer-1");
    const project = container.querySelector<HTMLSelectElement>('select[aria-label="Project"]')!;
    expect([...project.options].map((option) => option.textContent)).toContain("P-1 - Pier Works");
    expect([...project.options].some((option) => option.value === "project-2")).toBe(false);
    await act(async () => { project.value = "project-1"; project.dispatchEvent(new Event("change", { bubbles: true })); });
    expect(container.querySelector('[aria-label="Active booking filters"]')?.textContent).toContain("P-1 - Pier Works");
    expect(container.querySelector('[aria-label="Active booking filters"]')?.textContent).not.toContain("project-1");
    await act(async () => [...container.querySelectorAll("button")].find((button) => button.textContent === "Clear filters")?.click());
    expect(container.querySelector('output[aria-label="Current query"]')?.textContent).toBe("");
  });

  it("uses the authoritative overlap RPC for date changes and summary card filters", async () => {
    const { container, deps } = await render();
    const from = container.querySelector<HTMLInputElement>('input[aria-label="From"]')!;
    await setInput(from, "2026-10-09");
    const to = container.querySelector<HTMLInputElement>('input[aria-label="To"]')!;
    await setInput(to, "2026-10-11");
    expect(deps.readRepositories.canonicalBookings.searchCanonicalBookingCalendarRows).toHaveBeenCalledWith(expect.objectContaining({ windowStart: "2026-10-09", windowEnd: "2026-10-11" }));
    await act(async () => [...container.querySelectorAll("button")].find((button) => button.textContent?.includes("Releases Due"))?.click());
    expect(deps.readRepositories.canonicalBookings.searchCanonicalUpcomingReleaseRows).toHaveBeenCalled();
    expect(container.querySelector('output[aria-label="Current query"]')?.textContent).toContain("b_attention=release");
  });

  it("filters by equipment and status, debounces keyword search, and shows distinct empty periods", async () => {
    const { container } = await render();
    const equipment = container.querySelector<HTMLSelectElement>('select[aria-label="Equipment"]')!;
    await act(async () => { equipment.value = "equipment-1"; equipment.dispatchEvent(new Event("change", { bubbles: true })); });
    expect(container.querySelectorAll('tr[aria-label^="Open booking"]')).toHaveLength(1);
    expect(container.querySelector('output[aria-label="Current query"]')?.textContent).toContain("b_equipment=equipment-1");
    const status = container.querySelector<HTMLSelectElement>('select[aria-label="Status"]')!;
    await act(async () => { status.value = "Active"; status.dispatchEvent(new Event("change", { bubbles: true })); });
    expect(container.textContent).toContain("No bookings match these filters");
    await act(async () => [...container.querySelectorAll("button")].find((button) => button.textContent === "Clear filters")?.click());
    await setInput(container.querySelector<HTMLInputElement>('input[aria-label="Search bookings"]')!, "truck");
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 300)); });
    expect(container.querySelectorAll('tr[aria-label^="Open booking"]')).toHaveLength(1);
    expect(container.querySelector('output[aria-label="Current query"]')?.textContent).toContain("b_q=truck");
    await act(async () => [...container.querySelectorAll("button")].find((button) => button.textContent === "Clear filters")?.click());
    await setInput(container.querySelector<HTMLInputElement>('input[aria-label="From"]')!, "2030-01-01");
    await setInput(container.querySelector<HTMLInputElement>('input[aria-label="To"]')!, "2030-01-07");
    expect(container.textContent).toContain("No bookings in the selected dates");
  });

  it("hides commercial details when the reader lacks the permission", async () => {
    permissions.delete("rental.commercialTerms.read");
    const { container } = await render();
    await act(async () => container.querySelector<HTMLTableRowElement>('tr[aria-label^="Open booking"]')?.querySelectorAll("td")[1]?.click());
    await vi.waitFor(() => expect(container.querySelector('[role="dialog"]')).not.toBeNull());
    expect(container.querySelector('[role="dialog"]')?.textContent).not.toContain("Commercial summary");
    permissions.add("rental.commercialTerms.read");
  });

  it("uses 50-row server paging and persists page and sort in the URL", async () => {
    const many = Array.from({ length: 52 }, (_, index) => booking({ rentalEquipmentLineId: `line-${index}`, rentalNumber: `RB-${index}` }));
    const { container, deps } = await render("/assignments", many);
    expect(container.querySelectorAll('tr[aria-label^="Open booking"]')).toHaveLength(50);
    await act(async () => [...container.querySelectorAll("button")].find((button) => button.textContent === "Next")?.click());
    expect(container.querySelector('output[aria-label="Current query"]')?.textContent).toContain("b_page=2");
    expect(container.querySelectorAll('tr[aria-label^="Open booking"]')).toHaveLength(2);
    expect(deps.readRepositories.canonicalBookings.searchCanonicalBookingCalendarRows).toHaveBeenCalledWith(expect.objectContaining({ offset: 50, limit: 50 }));
    await act(async () => [...container.querySelectorAll("th button")].find((button) => button.textContent?.includes("Status"))?.click());
    expect(container.querySelector('output[aria-label="Current query"]')?.textContent).toContain("b_sort=rentalStatus");
    expect(container.querySelector('output[aria-label="Current query"]')?.textContent).not.toContain("b_page=2");
  });

  it("distinguishes an empty system from an empty selected period", async () => {
    const { container } = await render("/assignments", []);
    await vi.waitFor(() => expect(container.textContent).toContain("No bookings yet"));
  });

  it("searches equipment choices beyond the first catalog page", async () => {
    const deps = dependencies();
    const catalog = Array.from({ length: 100 }, (_, index) => ({ id: `equipment-${index}`, assetNo: `EX-${index}`, equipmentName: `Machine ${index}` }));
    deps.readRepositories.equipment.list = vi.fn(async () => repositorySuccess({ items: catalog, nextCursor: "100" }));
    deps.readRepositories.equipment.search = vi.fn(async () => repositorySuccess({ items: [{ id: "equipment-999", assetNo: "ZZ-999", equipmentName: "Remote Crane" }], nextCursor: undefined }));
    deps.readRepositories.equipment.getById = vi.fn(async () => repositorySuccess({ id: "equipment-999", assetNo: "ZZ-999", equipmentName: "Remote Crane" }));
    const { container } = await render("/assignments", rows, deps);
    const finder = container.querySelector<HTMLInputElement>('input[aria-label="Find equipment"]')!;
    expect(finder).not.toBeNull();
    await setInput(finder, "ZZ-999");
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 300)); });
    expect(deps.readRepositories.equipment.search).toHaveBeenCalledWith("ZZ-999", expect.anything());
    const equipment = container.querySelector<HTMLSelectElement>('select[aria-label="Equipment"]')!;
    expect([...equipment.options].map((option) => option.textContent)).toContain("ZZ-999 · Remote Crane");
    await act(async () => { equipment.value = "equipment-999"; equipment.dispatchEvent(new Event("change", { bubbles: true })); });
    expect(container.querySelector('output[aria-label="Current query"]')?.textContent).toContain("b_equipment=equipment-999");
  });
});
