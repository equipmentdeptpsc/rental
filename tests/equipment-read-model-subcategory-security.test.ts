import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync("supabase/migrations/20260905000200_fix_equipment_read_model_subcategory_security.sql", "utf8");

describe("Equipment read-model sub-category security projection", () => {
  it("retains the invoker-rights Equipment view and moves only presentation fields behind a fixed-path helper", () => {
    expect(migration).toContain("CREATE OR REPLACE VIEW erp.equipment_read_model WITH (security_invoker=true)");
    expect(migration).toContain("CREATE OR REPLACE FUNCTION erp.read_equipment_subcategory_projection(target_equipment_id text)");
    expect(migration).toContain("RETURNS TABLE(subcategory_id uuid,subcategory_name text,subcategory_active boolean)");
    expect(migration).toContain("SECURITY DEFINER");
    expect(migration).toContain("SET search_path=erp,auth,extensions,pg_catalog");
  });

  it("limits projection to Equipment rows visible in the caller-derived tenant", () => {
    expect(migration).toContain("e.company_id=erp.current_company_id()");
    expect(migration).toContain("erp.can_read_company_row(e.company_id)");
    expect(migration).toContain("s.company_id=e.company_id");
    expect(migration).toContain("LEFT JOIN LATERAL erp.read_equipment_subcategory_projection(e.id) projection ON true");
  });

  it("keeps direct Sub-Category access closed while allowing only the authenticated projection boundary", () => {
    expect(migration).toContain("REVOKE ALL ON FUNCTION erp.read_equipment_subcategory_projection(text) FROM PUBLIC,anon,authenticated,service_role");
    expect(migration).toContain("GRANT EXECUTE ON FUNCTION erp.read_equipment_subcategory_projection(text) TO authenticated");
    expect(migration).not.toMatch(/GRANT\\s+SELECT[\\s\\S]*erp\\.equipment_subcategories/i);
    expect(migration).not.toContain("ROW LEVEL SECURITY");
    expect(migration).not.toMatch(/GRANT\\s+(?:INSERT|UPDATE|DELETE)[\\s\\S]*authenticated/i);
  });

  it("preserves null and inactive historical sub-category presentation", () => {
    expect(migration).toContain("LEFT JOIN erp.equipment_subcategories s");
    expect(migration).toContain("s.name,s.active");
    expect(migration).not.toContain("s.active=true");
  });
});
