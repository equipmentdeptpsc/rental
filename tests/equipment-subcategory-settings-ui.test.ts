import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const page = readFileSync("src/features/masters/equipment-subcategory/pages.tsx", "utf8");
const router = readFileSync("src/app/router.tsx", "utf8");

describe("Equipment Sub-Categories canonical Settings UI", () => {
  it("uses canonical reads and commands with an intentional empty state", () => {
    expect(page).toContain("equipmentSubcategories.list()");
    expect(page).toContain("equipmentCategories.list()");
    expect(page).toContain("No equipment sub-categories have been set up yet.");
    expect(page).toContain("Create or activate an Equipment Category before adding a Sub-Category.");
    expect(page).toContain("usageCount");
  });

  it("gates actions by granular permissions and has no delete action", () => {
    expect(page).toContain('hasPermission("masterData.create")');
    expect(page).toContain('hasPermission("masterData.update")');
    expect(page).not.toContain("masterData.manage");
    expect(page).not.toMatch(/Delete/);
    expect(router).toContain('settings/equipment-subcategories", element: permitted("masterData.read"');
  });

  it("keeps remote mode on canonical repositories without local fallback", () => {
    expect(page).toContain("PersistenceMode.Remote");
    expect(page).toContain("deps.readRepositories.equipmentSubcategories");
    expect(page).toContain("deps.commandRepositories.equipmentSubcategories");
    expect(page).not.toContain("equipmentSubcategoryRepository");
  });
});
