import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(resolve("supabase/migrations/20260803005800_phase_c12_grouped_customer_review_cleanup_boundary.sql"), "utf8");
const position = (text: string) => sql.indexOf(text);

describe("C12 grouped Customer Review certified cleanup boundary", () => {
  it("is exact-tenant, exact-confirmation, and database-owner only", () => {
    expect(sql).toContain("TENANT-UAT-C12-GROUPED-CUSTOMER-001");
    expect(sql).toContain("CONFIRM-C12-GROUPED-CUSTOMER-CLEANUP");
    expect(sql).toContain("session_user<>database_owner OR current_user<>database_owner");
    expect(sql).not.toMatch(/target_tenant_id\s+(?:LIKE|~)/i);
    expect(sql).not.toContain("LIKE 'TENANT-UAT-%'");
  });

  it("uses the established owner-only security architecture", () => {
    expect(sql).toContain("RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=erp,pg_catalog");
    expect(sql).toContain("ALTER FUNCTION erp.cleanup_c12_grouped_customer_review_fixture(text,text,text) OWNER TO postgres");
    expect(sql).toContain("FROM PUBLIC,anon,authenticated,service_role");
    expect(sql).not.toMatch(/GRANT EXECUTE/i);
  });

  it("supports only the known two-line, two-day grouped certification shape", () => {
    for (const guard of [
      "users WHERE company_id=target_tenant_id)>1",
      "equipment WHERE company_id=target_tenant_id)>2",
      "assignments WHERE company_id=target_tenant_id)>2",
      "rental_equipment_lines WHERE company_id=target_tenant_id)>2",
      "deurs WHERE company_id=target_tenant_id)>2",
      "customer_review_requests WHERE company_id=target_tenant_id)>1",
      "customer_review_batches WHERE company_id=target_tenant_id)>2",
      "customer_review_batch_items WHERE company_id=target_tenant_id)>4",
    ]) expect(sql).toContain(guard);
  });

  it("deletes grouped children before every parent dependency", () => {
    const items = position("DELETE FROM customer_review_batch_items");
    const batches = position("DELETE FROM customer_review_batches");
    expect(items).toBeGreaterThan(0);
    expect(items).toBeLessThan(batches);
    for (const parent of ["customer_review_requests", "deurs", "rental_equipment_lines", "rentals", "equipment", "operators", "projects", "customers", "companies"]) {
      expect(batches).toBeLessThan(position(`DELETE FROM ${parent}`));
    }
  });

  it("rejects financial, maintenance, Manager, and notification evidence", () => {
    for (const table of ["billing_statements", "billing_statement_lines", "collections", "recovery_compensations", "maintenance_records", "equipment_daily_logs", "manager_review_requests"]) {
      expect(sql).toContain(table);
    }
    expect(sql).toContain("notification_outbox WHERE company_id=target_tenant_id)>0");
    expect(sql).toContain("notification_delivery_attempts WHERE company_id=target_tenant_id)>0");
  });

  it("uses only the exact transaction-local marker for immutable fixture evidence", () => {
    expect(sql).toContain("set_config('erp.c12_grouped_review_fixture_cleanup',target_tenant_id,true)");
    expect(sql).toContain("current_setting('erp.c12_grouped_review_fixture_cleanup',true)='TENANT-UAT-C12-GROUPED-CUSTOMER-001'");
    expect(sql).not.toMatch(/session_replication_role/i);
    expect(sql).not.toMatch(/DISABLE\s+TRIGGER/i);
    expect(sql).not.toMatch(/DISABLE\s+ROW\s+LEVEL\s+SECURITY/i);
  });

  it("does not touch Auth identities or shared catalogs", () => {
    expect(sql).not.toMatch(/(?:INSERT|UPDATE|DELETE)\s+(?:FROM\s+)?auth\.users/i);
    expect(sql).not.toMatch(/DELETE FROM (?:app_roles|app_permissions|role_permissions)/i);
    expect(sql).toContain("DELETE FROM user_roles ur USING users u");
  });

  it("protects the compatibility tenant before and after cleanup", () => {
    expect(sql.match(/companies WHERE id='TENANT-LOCAL-001' AND code='LOCAL' AND environment_class='compatibility'/g)).toHaveLength(2);
    expect(sql).toContain("protected local tenant postcondition failed");
  });

  it("is zero-state idempotent by construction", () => {
    expect(sql).toContain("removed jsonb='{}'::jsonb");
    expect(sql).toContain("GET DIAGNOSTICS affected=ROW_COUNT");
    expect(sql).not.toMatch(/RAISE EXCEPTION[^;]+not found/i);
  });
});
