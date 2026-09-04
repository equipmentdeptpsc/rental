import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const remoteForm = readFileSync("src/features/equipment/components/RemoteEquipmentForm.tsx", "utf8");
const details = readFileSync("src/pages/Equipment/Details.tsx", "utf8");
const edit = readFileSync("src/pages/Equipment/Edit.tsx", "utf8");
const drawer = readFileSync("src/features/masters/equipment-subcategory/EquipmentSubcategoryDrawer.tsx", "utf8");

describe("Milestone 11.3B2 Equipment Sub-Category selector cutover", () => {
  it("uses canonical categories and assignable sub-categories in remote create", () => {
    expect(remoteForm).toContain("equipmentCategories.list()");
    expect(remoteForm).toContain("equipmentSubcategories.listAssignable(form.categoryId)");
    expect(remoteForm).toContain("categoryId: form.categoryId");
    expect(remoteForm).toContain("subcategoryId: form.subcategoryId");
    expect(remoteForm).not.toContain("useEquipmentCategories");
    expect(remoteForm).not.toContain("useEquipmentSubcategories");
  });

  it("blocks invalid create prerequisites and clears a stale selection on category change", () => {
    expect(remoteForm).toContain("Select an Equipment Category.");
    expect(remoteForm).toContain("Select an Equipment Sub-Category.");
    expect(remoteForm).toContain('categoryId: event.target.value, subcategoryId: ""');
    expect(remoteForm).toContain("Create or activate an Equipment Category before creating Equipment.");
  });

  it("keeps remote edit read-only and renders historical canonical detail state", () => {
    expect(edit).toContain("Remote Equipment sub-category edit is pending a canonical Equipment update command.");
    expect(details).toContain("Sub-Category");
    expect(details).toContain("— Inactive");
    expect(details).toContain('subcategoryName ?');
  });

  it("reuses the B1 drawer without implicitly saving or selecting Equipment", () => {
    expect(remoteForm).toContain("EquipmentSubcategoryDrawer");
    expect(remoteForm).toContain("initialCategoryId={form.categoryId}");
    expect(remoteForm).toContain("setSubcategoryRefresh");
    expect(drawer).toContain("commandRepositories.equipmentSubcategories");
    expect(drawer).not.toContain("createEquipment");
  });
});
