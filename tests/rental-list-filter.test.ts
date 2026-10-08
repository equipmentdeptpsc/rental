import { describe, expect, it } from "vitest";

import { emptyRentalListFilters, filterRentalList, rentalFilterOptions } from "@/features/rental/services/filterRentalList";
import { clearRentalFilterParams, readRentalFilters, updateRentalFilterParams } from "@/features/rental/services/rentalFilterUrl";
import { rentalListReturnPath, rentalWorkspaceFromListPath } from "@/features/rental/services/rentalListNavigation";
import type { RentalRecord } from "@/features/rental/types";

const rental = {
  id: "rental-1",
  rentalNumber: "RNT-2026-0081",
  equipmentId: "equipment-1",
  customer: "Acme Construction",
  project: "Harbor Expansion",
  rentedBy: "Dispatcher",
  dateOut: "2026-08-21",
  statusId: "active",
  status: "Active",
} satisfies RentalRecord;

const input = {
  rentals: [rental],
  lines: [{ id: "line-1", rentalId: rental.id, equipmentId: "equipment-1", operatorId: "operator-1", status: "Active" as const, createdAt: "", updatedAt: "" }],
  equipment: [{ id: "equipment-1", prefixId: "eq", assetNo: "EXC-0042", equipmentName: "Crawler Excavator", category: "Moving Equipment" as const, status: "Rented" as const, maintenanceType: "Engine Hours" as const, currentReading: 100, projectId: "project-1", operatorId: "operator-1" }],
  operators: [{ id: "operator-1", name: "Juan Operator", email: "", licenseNumber: "OP-001", certificationType: "Heavy Machinery" as const, joinedDate: "2026-01-01", status: "Active" as const }],
};

describe("rental list search", () => {
  it.each(["RNT-2026", "Acme", "Harbor", "Crawler", "EXC-0042", "Juan Operator"])("finds an active rental by %s", (query) => {
    expect(filterRentalList({ ...input, query })).toEqual([rental]);
  });

  it("returns all loaded rentals for an empty query", () => {
    expect(filterRentalList({ ...input, query: "  " })).toEqual([rental]);
  });

  it("filters customer, project, equipment, operator, status, and start dates together", () => {
    const rentals = [{ ...rental, customerId: "customer-1", projectId: "project-1", remarks: "Gate B" }, { ...rental, id: "other", rentalNumber: "RNT-OTHER", customerId: "customer-2", projectId: "project-2", equipmentId: "other-equipment", dateOut: "2026-09-01", status: "Reserved" as const }];
    const data = { ...input, rentals, projects: [{ id: "project-1", projectCode: "P-7", projectName: "Harbor Expansion", customerId: "customer-1", location: "North Dock", projectManager: "", status: "Active" as const }] };
    for (const [key, value] of Object.entries({ customer: "customer-1", project: "project-1", equipment: "equipment-1", operator: "operator-1", status: "Active", to: "2026-08-22", query: "Gate B" })) {
      expect(filterRentalList({ ...data, filters: { ...emptyRentalListFilters, [key]: value } })).toEqual([rentals[0]]);
    }
    expect(filterRentalList({ ...data, filters: { ...emptyRentalListFilters, query: "North Dock" } })).toEqual([rentals[0]]);
    expect(filterRentalList({ ...data, filters: { ...emptyRentalListFilters, from: "2026-08-22" } })).toEqual([rentals[1]]);
  });

  it("offers readable dependent project and equipment/operator labels", () => {
    const rentals = [{ ...rental, customerId: "customer-1", projectId: "project-1" }, { ...rental, id: "other", customerId: "customer-2", projectId: "project-2", customer: "Another Customer", project: "Another Project" }];
    const options = rentalFilterOptions({ ...input, rentals, customers: [{ id: "customer-1", customerCode: "C-1", companyName: "Acme Construction", active: true }], projects: [{ id: "project-1", projectCode: "P-7", projectName: "Harbor Expansion", customerId: "customer-1", location: "", projectManager: "", status: "Active" }], customer: "customer-1" });
    expect(options.projects).toEqual([{ value: "project-1", label: "P-7 - Harbor Expansion" }]);
    expect(options.customers[0].label).toBe("Acme Construction");
    expect(options.equipment).toContainEqual({ value: "equipment-1", label: "EXC-0042 - Crawler Excavator" });
    expect(options.operators).toContainEqual({ value: "operator-1", label: "Juan Operator" });
    expect(JSON.stringify(options)).not.toContain("undefined");
    const mismatched = rentalFilterOptions({ ...input, rentals, customers: [], projects: [{ id: "project-1", projectCode: "P-7", projectName: "Harbor Expansion", customerId: "customer-2", location: "", projectManager: "", status: "Active" }], customer: "customer-1" });
    expect(mismatched.projects).toEqual([]);
  });

  it("keeps tab context and unrelated query state while filters change or clear", () => {
    const current = new URLSearchParams("view=engagements&r_customer=customer-1&r_project=project-1&r_page=3&r_sort=status&tab=overview");
    const updated = updateRentalFilterParams(current, "customer", "customer-2");
    expect(readRentalFilters(updated).customer).toBe("customer-2");
    expect(readRentalFilters(updated).project).toBe("");
    expect(updated.has("r_page")).toBe(false);
    const cleared = clearRentalFilterParams(updated);
    expect(cleared.get("view")).toBe("engagements");
    expect(cleared.get("r_sort")).toBe("status");
    expect(cleared.get("tab")).toBe("overview");
    expect(readRentalFilters(cleared)).toEqual(emptyRentalListFilters);
  });

  it("returns from a workspace to the original filtered tab", () => {
    const path = rentalWorkspaceFromListPath("rental-1", "?view=engagements&r_customer=customer-1&r_page=2");
    expect(path).toContain("/rentals/rental-1/workspace?listQuery=");
    expect(rentalListReturnPath(path.split("?")[1])).toBe("/rentals?view=engagements&r_customer=customer-1&r_page=2");
    expect(rentalListReturnPath("")).toBe("/rentals");
  });
});
