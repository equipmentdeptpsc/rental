import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const detail = readFileSync("src/pages/Equipment/Details.tsx", "utf8");
const hook = readFileSync("src/features/equipment/hooks/useCanonicalEquipmentDetail.ts", "utf8");

describe("canonical Equipment detail foundation", () => {
  it("keeps remote detail separate from the local compatibility surface", () => {
    expect(detail).toContain("useCanonicalEquipmentDetail");
    expect(hook).toContain("readRepositories.equipment.getById");
    expect(hook).not.toContain("localStorage");
    expect(hook).not.toContain("useEquipment()");
  });

  it("uses active-only Assignment and current non-final Rental semantics", () => {
    expect(hook).toContain('item.status === "Active" && !item.deleted');
    for (const status of ["Draft", "Assigned", "Reserved", "Released", "Active"]) expect(hook).toContain(`"${status}"`);
    for (const status of ["Returned", "Closed", "Cancelled"]) expect(hook).not.toContain(`"${status}"`);
    expect(detail).toContain("Not currently assigned");
    expect(detail).toContain("No current rental");
  });

  it("resolves secondary detail data on demand and gates each section independently", () => {
    expect(hook).toContain('hasPermission("assignment.read")');
    expect(hook).toContain('hasPermission("rental.read")');
    expect(hook).toContain('hasPermission("project.read")');
    expect(hook).toContain('hasPermission("operator.read")');
    expect(hook).toContain('hasPermission("customer.read")');
    expect(detail).toContain("Loading assignment");
    expect(detail).toContain("Loading rental");
  });
});
