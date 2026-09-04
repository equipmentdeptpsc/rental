import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync("supabase/migrations/20260905000100_allow_authenticated_equipment_category_read.sql", "utf8");
const repository = readFileSync("src/integrations/supabase/SupabaseEquipmentSubcategoryRepository.ts", "utf8");

describe("canonical Equipment Category read permission", () => {
  it("grants only the existing reader columns to authenticated", () => {
    expect(migration).toContain("GRANT SELECT (id, code, name, description, active, deleted_at, sort_order)");
    expect(migration).toContain("ON TABLE erp.equipment_categories TO authenticated");
    expect(migration).not.toMatch(/\b(INSERT|UPDATE|DELETE|TRUNCATE)\b/);
    expect(migration).not.toContain(" TO anon");
    expect(migration).not.toContain("ROW LEVEL SECURITY");
  });

  it("keeps the direct global category reader and active/non-deleted filtering", () => {
    expect(repository).toContain('from("equipment_categories").select("id,name,active")');
    expect(repository).toContain('.eq("active", true)');
    expect(repository).toContain('.is("deleted_at", null)');
  });
});
