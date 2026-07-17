import { describe, expect, it } from "vitest";
import { findEquipmentBlockingRental, isEquipmentBlockingRental } from "@/features/rental/services/RentalWorkflowRules";
import type { RentalLifecycleStatus, RentalRecord } from "@/features/rental/types";

function rental(status: RentalLifecycleStatus, id: string = status): RentalRecord {
  return {
    id,
    equipmentId: "equipment-1",
    customer: "Customer",
    project: "Project",
    rentedBy: "",
    dateOut: "2026-01-01",
    statusId: "",
    status,
  };
}

describe("rental equipment integrity", () => {
  it.each(["Draft", "Assigned", "Reserved", "Released", "Active"] as const)("treats %s as equipment-blocking", (status) => {
    expect(isEquipmentBlockingRental(rental(status))).toBe(true);
  });

  it.each(["Returned", "Closed", "Cancelled"] as const)("does not let final %s rentals block a later rental", (status) => {
    expect(findEquipmentBlockingRental([rental(status)], "equipment-1")).toBeUndefined();
  });

  it("finds another blocking rental without mutating the input collection", () => {
    const rentals = [rental("Returned", "returned"), rental("Reserved", "blocking")];
    const before = structuredClone(rentals);
    expect(findEquipmentBlockingRental(rentals, "equipment-1", "returned")?.id).toBe("blocking");
    expect(rentals).toEqual(before);
  });
});
