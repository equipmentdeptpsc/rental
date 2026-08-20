import { describe, expect, it } from "vitest";

import { filterRentalList } from "@/features/rental/services/filterRentalList";
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
  operators: [{ id: "operator-1", name: "Juan Operator", status: "Active" as const }],
};

describe("rental list search", () => {
  it.each(["RNT-2026", "Acme", "Harbor", "Crawler", "EXC-0042", "Juan Operator"])("finds an active rental by %s", (query) => {
    expect(filterRentalList({ ...input, query })).toEqual([rental]);
  });

  it("returns all loaded rentals for an empty query", () => {
    expect(filterRentalList({ ...input, query: "  " })).toEqual([rental]);
  });
});
