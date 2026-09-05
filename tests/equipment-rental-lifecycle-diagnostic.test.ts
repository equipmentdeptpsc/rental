import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const page = readFileSync("src/pages/Equipment/Details.tsx", "utf8");

describe("UAT Rental lifecycle diagnostic", () => {
  it("is isolated to remote UAT and requires both read permissions", () => {
    expect(page).toContain("uat\\.pscequipment\\.online");
    expect(page).toContain('configuration.persistenceMode === "remote"');
    expect(page).toContain('hasPermission("equipment.read")');
    expect(page).toContain('hasPermission("rental.read")');
    expect(page).toContain("readRepositories.rentalLifecycleHistory.getEquipmentRentalLifecycleEvents(equipmentId)");
  });

  it("renders only bounded read results and has no mutation path", () => {
    expect(page).toContain("UAT Rental Lifecycle History");
    expect(page).toContain("event.eventType");
    expect(page).toContain("event.rentalNumber");
    expect(page).toContain("event.occurredAt");
    expect(page).not.toContain("commandRepositories.rentalLifecycleHistory");
    expect(page).not.toContain("createEquipmentRentalLifecycle");
  });
});
