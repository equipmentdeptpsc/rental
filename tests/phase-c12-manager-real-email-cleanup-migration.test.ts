import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const path = "supabase/migrations/20260803005000_phase_c12_manager_real_email_cleanup.sql";
const sql = readFileSync(path, "utf8");

const position = (statement: string) => {
  const index = sql.indexOf(statement);
  expect(index, `${statement} must exist`).toBeGreaterThan(-1);
  return index;
};

describe("C12 exact Manager real-email cleanup boundary", () => {
  it("accepts only the exact Manager-email tenant and confirmation", () => {
    expect(sql).toContain("target_tenant_id IS DISTINCT FROM 'TENANT-UAT-C12-MANAGER-EMAIL-001'");
    expect(sql).toContain("expected_tenant_code IS DISTINCT FROM 'TENANT-UAT-C12-MANAGER-EMAIL-001'");
    expect(sql).toContain("confirmation IS DISTINCT FROM 'CONFIRM-C12-MANAGER-EMAIL-CLEANUP'");
    for (const tenant of [
      "TENANT-LOCAL-001",
      "TENANT-UAT-C12-MANAGER-001",
      "TENANT-UAT-C12-CUSTOMER-EMAIL-001",
      "TENANT-UAT-C4E-FINANCIAL",
    ]) expect(sql).toContain(tenant);
    expect(sql).not.toMatch(/LIKE\s+['"]TENANT-UAT|SIMILAR TO|~\s+['"]TENANT-UAT/i);
  });

  it("is owner-only and unavailable to application roles", () => {
    expect(sql).toContain("SECURITY DEFINER");
    expect(sql).toContain("SET search_path = erp, pg_catalog");
    expect(sql).toContain("session_user <> database_owner OR current_user <> database_owner");
    expect(sql).toContain("cleanup_c12_manager_real_email_fixture(text,text,text) OWNER TO postgres");
    expect(sql).toMatch(/REVOKE ALL[\s\S]*cleanup_c12_manager_real_email_fixture\(text,text,text\)[\s\S]*FROM PUBLIC, anon, authenticated, service_role/);
  });

  it("protects the local tenant before and after cleanup", () => {
    expect(sql.match(/id = 'TENANT-LOCAL-001' AND code = 'LOCAL' AND environment_class = 'compatibility'/g)).toHaveLength(2);
    expect(sql).toContain("protected local tenant invariant failed");
    expect(sql).toContain("protected local tenant postcondition failed");
  });

  it("never mutates Auth or shared authorization catalogs", () => {
    expect(sql).not.toMatch(/(?:DELETE|UPDATE|INSERT|SELECT)[^;]*auth\.users/i);
    expect(sql).not.toMatch(/DELETE FROM (?:erp\.)?(?:app_roles|app_permissions|role_permissions)/i);
    expect(sql).not.toMatch(/session_replication_role|DISABLE\s+TRIGGER|DISABLE\s+ROW\s+LEVEL\s+SECURITY/i);
  });

  it("supports Customer prerequisite and Manager approval evidence", () => {
    for (const table of [
      "customer_correction_requests", "customer_review_outcomes", "customer_review_requests",
      "manager_correction_requests", "manager_review_outcomes", "manager_review_requests",
      "notification_delivery_attempts", "notification_outbox",
    ]) expect(sql).toContain(`DELETE FROM ${table} WHERE company_id = target_tenant_id`);
    expect(position("DELETE FROM manager_review_outcomes")).toBeLessThan(position("DELETE FROM manager_review_requests"));
    expect(position("DELETE FROM customer_review_outcomes")).toBeLessThan(position("DELETE FROM customer_review_requests"));
  });

  it("uses an exact transaction-local marker for immutable evidence only", () => {
    expect(sql).toContain("set_config('erp.c12_manager_email_fixture_cleanup', target_tenant_id, true)");
    for (const helper of [
      "protect_deur_event_history", "reject_immutable_change", "reject_customer_review_evidence_change",
      "reject_manager_review_outcome_change", "reject_terminal_notification_change",
    ]) expect(sql).toContain(`FUNCTION erp.${helper}`);
    expect(sql).toMatch(/current_setting\('erp\.c12_manager_email_fixture_cleanup', true\) = 'TENANT-UAT-C12-MANAGER-EMAIL-001'[\s\S]*OLD\.company_id = 'TENANT-UAT-C12-MANAGER-EMAIL-001'/);
    expect(sql).toContain("RAISE EXCEPTION 'manager review evidence is immutable'");
    expect(sql).toContain("RAISE EXCEPTION 'customer review evidence is immutable'");
  });

  it("blocks unexpected financial, maintenance, daily-log, and recovery evidence", () => {
    for (const table of [
      "billing_statements", "billing_statement_lines", "collections", "recovery_compensations",
      "maintenance_records", "equipment_daily_logs",
    ]) expect(sql).toContain(table);
    expect(sql).toContain("unexpected billing, collection, recovery, maintenance, or daily-log evidence exists");
    expect(sql).not.toMatch(/DELETE FROM (?:billing_statements|billing_statement_lines|collections|recovery_compensations|maintenance_records|equipment_daily_logs)/);
  });

  it("enforces narrow positive-flow shape limits", () => {
    for (const fragment of [
      "users WHERE company_id = target_tenant_id) > 2",
      "operators WHERE company_id = target_tenant_id) > 1",
      "rentals WHERE company_id = target_tenant_id) > 1",
      "rental_equipment_lines WHERE company_id = target_tenant_id) > 1",
      "customer_review_requests WHERE company_id = target_tenant_id) > 1",
      "manager_review_requests WHERE company_id = target_tenant_id) > 1",
      "manager_review_outcomes WHERE company_id = target_tenant_id) > 1",
      "notification_outbox WHERE company_id = target_tenant_id) > 4",
    ]) expect(sql).toContain(fragment);
    expect(sql).toContain("unexpected extra manager email fixture data exists");
  });

  it("follows the audited child-to-parent deletion order", () => {
    expect(position("DELETE FROM notification_delivery_attempts")).toBeLessThan(position("DELETE FROM notification_outbox"));
    expect(position("DELETE FROM customer_review_requests")).toBeLessThan(position("DELETE FROM deurs"));
    expect(position("DELETE FROM manager_review_requests")).toBeLessThan(position("DELETE FROM deurs"));
    expect(position("DELETE FROM deur_activity_logs")).toBeLessThan(position("DELETE FROM deurs"));
    expect(position("DELETE FROM commercial_snapshots")).toBeLessThan(position("DELETE FROM rental_contracts"));
    expect(position("DELETE FROM rental_contracts")).toBeLessThan(position("DELETE FROM rental_equipment_lines"));
    expect(position("DELETE FROM rental_equipment_lines")).toBeLessThan(position("DELETE FROM rentals"));
    expect(position("DELETE FROM rentals")).toBeLessThan(position("DELETE FROM assignments"));
    expect(position("DELETE FROM equipment_history")).toBeLessThan(position("DELETE FROM equipment WHERE"));
    expect(position("DELETE FROM user_roles")).toBeLessThan(position("DELETE FROM users WHERE"));
    expect(position("DELETE FROM users WHERE")).toBeLessThan(position("DELETE FROM operators WHERE"));
  });

  it("returns aggregate counts and supports zero-state/idempotent invocation", () => {
    expect(sql).toContain("removed jsonb = '{}'::jsonb");
    expect(sql).toContain("GET DIAGNOSTICS affected = ROW_COUNT");
    expect(sql).toContain("RETURN removed");
    expect(sql).not.toMatch(/RETURN(?:ING)?\s+.*(?:email|token|hash|destination|recipient)/i);
    expect(sql).not.toMatch(/fixture tenant missing|required fixture/i);
  });

  it("preserves applied migrations 04400 through 04900 byte-for-byte", () => {
    const expected: Record<string, string> = {
      "20260803004400_phase_c12_review_recipient_and_billing_evidence.sql": "dd9608ec631011a359c062397a2d180d835fada1201a6caeb63d5bb61cf6c125",
      "20260803004500_phase_c12_c4e_customer_review_outcome_residue_cleanup.sql": "50c8c325975abfaaa43ef7ba1132f6fefad1137ca3e6d14107bf74930cbe86a6",
      "20260803004600_phase_c12_manager_certification_cleanup.sql": "2753457ed84baf72e8ada355835336c9caf170d717070c2c613d69e4560dbc35",
      "20260803004700_phase_c12_customer_email_certification_cleanup.sql": "01fb34731efbd02b4a345c04fe1c2ffc0083c42de7ea1402af12fe75f19a7487",
      "20260803004800_phase_c12_customer_email_cleanup_dependency_order_correction.sql": "43b7fc272ca7a01f80ddba33a7b7190a83d5fd70016d2244dc355e4d2ac5cbd3",
      "20260803004900_phase_c12_customer_review_company_evidence.sql": "c7a955ca13ea48841ede304e6daf34186a747e50e80c5dd96f314ed4ede85540",
    };
    for (const [file, digest] of Object.entries(expected)) {
      const actual = createHash("sha256").update(readFileSync(`supabase/migrations/${file}`)).digest("hex");
      expect(actual).toBe(digest);
    }
  });
});
