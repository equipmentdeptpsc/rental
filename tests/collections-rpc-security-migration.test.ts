import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migrationPath = "supabase/migrations/20261011000200_harden_collections_rental_read_permission.sql";
const migration = () => readFileSync(migrationPath, "utf8");
const projection = () => migration().match(/WHERE([\s\S]*?)ORDER BY collection_row\.collected_at ASC, collection_row\.id ASC;/)?.[1] ?? "";

describe("Collections rental read RPC security", () => {
  it("allows only an authenticated, active-company caller with collections.read", () => {
    expect(migration()).toContain("CREATE OR REPLACE FUNCTION erp.read_collections_for_rental(target_rental_id text)");
    expect(projection()).toMatch(/auth\.uid\(\) IS NOT NULL\s+AND erp\.current_user_has_permission\('collections\.read'\)/);
    expect(projection()).toContain("AND erp.can_read_company_row(collection_row.company_id)");
  });

  it("returns no rows to authenticated callers lacking collections.read", () => {
    expect(projection()).toMatch(/AND erp\.current_user_has_permission\('collections\.read'\)/);
    expect(projection()).not.toMatch(/\bOR\b/);
  });

  it("uses canonical helpers that reject inactive users and inactive companies", () => {
    const permissionView = readFileSync("supabase/migrations/20260825000600_trusted_application_user_deactivation.sql", "utf8");
    const companyRead = readFileSync("supabase/migrations/20260729002000_phase_c4b_tenant_read_policy_helper.sql", "utf8");
    expect(permissionView).toContain("application_user.status='active'");
    expect(companyRead).toContain("company.active");
    expect(companyRead).toContain("caller.status = 'active'");
    expect(projection()).toContain("AND erp.can_read_company_row(collection_row.company_id)");
  });

  it("keeps the tenant and requested-rental boundaries", () => {
    expect(projection()).toContain("collection_row.company_id = erp.current_company_id()");
    expect(projection()).toContain("collection_row.rental_id = read_collections_for_rental.target_rental_id");
    expect(projection()).toContain("erp.can_read_company_row(collection_row.company_id)");
  });

  it("retains the read-only shape, stable order, and restricted execute grant", () => {
    const sql = migration();
    expect(sql).toContain("RETURNS SETOF erp.collections");
    expect(sql).toMatch(/LANGUAGE sql\s+STABLE\s+SECURITY DEFINER/);
    expect(sql).toContain("ORDER BY collection_row.collected_at ASC, collection_row.id ASC");
    expect(sql).toContain("REVOKE ALL ON FUNCTION erp.read_collections_for_rental(text) FROM PUBLIC, anon, service_role");
    expect(sql).toContain("GRANT EXECUTE ON FUNCTION erp.read_collections_for_rental(text) TO authenticated");
    expect(sql).not.toMatch(/\b(?:INSERT|UPDATE|DELETE)\b/i);
  });
});
