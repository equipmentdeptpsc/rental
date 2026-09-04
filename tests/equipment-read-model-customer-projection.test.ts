import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync("supabase/migrations/20260905000400_add_current_customer_to_equipment_read_model.sql", "utf8");

describe("Equipment current-customer read projection", () => {
  it("keeps the invoker-rights view and exposes only a bounded customer identifier", () => {
    expect(migration).toContain("CREATE OR REPLACE VIEW erp.equipment_read_model WITH (security_invoker=true)");
    expect(migration).toContain("RETURNS TABLE(customer_id text)");
    expect(migration).toContain("LEFT JOIN LATERAL erp.read_equipment_current_customer_projection(equipment.id) current_customer ON true");
    expect(migration).not.toContain("customer_name");
  });

  it("uses only live tenant-matched rental lineage and every non-final rental status", () => {
    for (const status of ["Draft", "Assigned", "Reserved", "Released", "Active"]) expect(migration).toContain(`'${status}'`);
    expect(migration).toContain("line.company_id=equipment.company_id");
    expect(migration).toContain("rental.company_id=line.company_id");
    expect(migration).toContain("line.deleted_at IS NULL");
    expect(migration).not.toContain("rental.deleted_at");
    expect(migration).toContain("caller.id=auth.uid()");
    expect(migration).toContain("caller.company_id=equipment.company_id");
  });

  it("defends the one-row Equipment projection with deterministic current-rental precedence", () => {
    expect(migration).toContain("ORDER BY rental.updated_at DESC,rental.created_at DESC,rental.id DESC,line.updated_at DESC,line.id DESC");
    expect(migration).toContain("LIMIT 1");
  });

  it("keeps the helper private except for authenticated view readers", () => {
    expect(migration).toContain("REVOKE ALL ON FUNCTION erp.read_equipment_current_customer_projection(text) FROM PUBLIC,anon,authenticated,service_role");
    expect(migration).toContain("GRANT EXECUTE ON FUNCTION erp.read_equipment_current_customer_projection(text) TO authenticated");
  });
});
