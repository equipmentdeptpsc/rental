import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { SupabaseEquipmentSubcategoryRepository } from "@/integrations/supabase/SupabaseEquipmentSubcategoryRepository";

const migration = readFileSync("supabase/migrations/20260904000400_equipment_subcategory_canonical_foundation.sql", "utf8");

describe("canonical equipment sub-category foundation", () => {
  it("creates a tenant-owned master table beneath global categories", () => {
    expect(migration).toContain("CREATE TABLE erp.equipment_subcategories");
    expect(migration).toContain("company_id text NOT NULL REFERENCES erp.companies(id)");
    expect(migration).toContain("category_id text NOT NULL REFERENCES erp.equipment_categories(id)");
    expect(migration).toContain("uq_equipment_subcategories_company_category_name_normalized");
    expect(migration).toContain("row_version bigint NOT NULL DEFAULT 1");
  });

  it("keeps direct table access closed and uses granular master-data permissions", () => {
    expect(migration).toContain("REVOKE ALL ON TABLE erp.equipment_subcategories FROM PUBLIC,anon,authenticated,service_role");
    expect(migration).toContain("'masterData.read'");
    expect(migration).toContain("'masterData.create'");
    expect(migration).toContain("'masterData.update'");
    expect(migration).not.toContain("masterData.manage");
  });

  it("extends Equipment creation optionally and prevents category mismatch", () => {
    expect(migration).toContain("ADD COLUMN subcategory_id uuid");
    expect(migration).toContain("EQUIPMENT_SUBCATEGORY_CATEGORY_MISMATCH");
    expect(migration).toContain("EQUIPMENT_SUBCATEGORY_NOT_SELECTABLE");
    expect(migration).toContain("'currentReading','remarks','categoryId','subcategoryId'");
    expect(migration).toContain("equipment_read_model");
  });

  it("maps canonical RPC rows without exposing tenant identity", async () => {
    const calls: string[] = [];
    const repository = new SupabaseEquipmentSubcategoryRepository({ schema: () => ({ rpc: async (name: string) => { calls.push(name); return { data: [{ id: "b9e0f8d2-5275-4a43-9c42-11ca2e75ed58", category_id: "global-category", name: "Excavator", code: "EXC", active: true, usage_count: 2, updated_at: "2026-09-04T00:00:00.000Z", row_version: 3 }], error: null }; } }) } as never);
    const result = await repository.listAssignable("global-category");
    expect(result.success).toBe(true);
    if (result.success) expect(result.value[0]).toMatchObject({ id: "b9e0f8d2-5275-4a43-9c42-11ca2e75ed58", categoryId: "global-category", name: "Excavator", usageCount: 2, rowVersion: 3 });
    expect(calls).toEqual(["list_assignable_equipment_subcategories"]);
  });
});
