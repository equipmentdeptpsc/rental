import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import RentalSharedFilters from "@/features/rental/components/RentalSharedFilters";
import { emptyRentalListFilters } from "@/features/rental/services/filterRentalList";

const roots: Root[] = [];
afterEach(async () => { while (roots.length) await act(async () => roots.pop()?.unmount()); });

describe("shared Rental filters", () => {
  it("shows readable choices, active chips, removal and clear controls", async () => {
    const container = document.createElement("div");
    const root = createRoot(container); roots.push(root);
    const onChange = vi.fn();
    const onClear = vi.fn();
    const options = { customers: [{ value: "customer-uuid", label: "North Harbor" }], projects: [{ value: "project-uuid", label: "P-7 - Pier Works" }], equipment: [{ value: "equipment-uuid", label: "EX-12 - Excavator" }], operators: [{ value: "operator-uuid", label: "Ada Operator" }], statuses: [{ value: "Active", label: "Active" }] };
    await act(async () => root.render(createElement(RentalSharedFilters, { filters: { ...emptyRentalListFilters, customer: "customer-uuid", project: "project-uuid" }, options, onChange, onClear })));
    expect(container.querySelectorAll("select")).toHaveLength(5);
    expect(container.querySelector('select[aria-label="Project filter"]')?.textContent).toContain("P-7 - Pier Works");
    expect(container.querySelector('[aria-label="Active rental filters"]')?.textContent).toContain("Customer: North Harbor");
    expect(container.querySelector('[aria-label="Active rental filters"]')?.textContent).toContain("Project: P-7 - Pier Works");
    expect(container.querySelector('[aria-label="Active rental filters"]')?.textContent).not.toContain("project-uuid");
    await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="Remove project filter"]')?.click());
    expect(onChange).toHaveBeenCalledWith("project", "");
    await act(async () => [...container.querySelectorAll("button")].find((button) => button.textContent === "Clear filters")?.click());
    expect(onClear).toHaveBeenCalledOnce();
  });

  it("debounces keyword changes", async () => {
    const container = document.createElement("div");
    const root = createRoot(container); roots.push(root);
    const onChange = vi.fn();
    const options = { customers: [], projects: [], equipment: [], operators: [], statuses: [] };
    await act(async () => root.render(createElement(RentalSharedFilters, { filters: emptyRentalListFilters, options, onChange, onClear: vi.fn() })));
    const input = container.querySelector<HTMLInputElement>('input[aria-label="Search rentals"]')!;
    await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, "excavator"); input.dispatchEvent(new Event("input", { bubbles: true })); input.dispatchEvent(new Event("change", { bubbles: true })); });
    expect(onChange).not.toHaveBeenCalled();
    await vi.waitFor(() => expect(onChange).toHaveBeenCalledWith("query", "excavator"));
  });
});
