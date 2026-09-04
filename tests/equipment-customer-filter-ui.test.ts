import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const page = readFileSync("src/pages/Equipment/index.tsx", "utf8");
const filters = readFileSync("src/features/equipment/hooks/useCanonicalEquipmentFilters.ts", "utf8");

describe("canonical Equipment customer filter UI", () => {
  it("uses the canonical Customer repository behind customer.read and renders names with internal IDs", () => {
    expect(page).toContain('hasPermission("customer.read")');
    expect(filters).toContain("readRepositories.customers.list()");
    expect(page).toContain('aria-label="Customer"');
    expect(page).toContain("value={value.id}");
    expect(page).toContain("{value.companyName}");
    expect(filters).not.toContain("localStorage");
  });

  it("passes the selected identifier to the remote read and clears it with the other filters", () => {
    expect(page).toContain("useCanonicalEquipmentData({ categoryId, subcategoryId, statusId, projectId, customerId })");
    expect(page).toContain("setCustomerId(\"\")");
    expect(page).toContain("projectId || customerId");
  });

  it("does not offer the deferred no-current-customer null predicate", () => {
    expect(page).not.toContain("No Current Customer");
    expect(page).not.toContain("customerIsNull");
  });
});
