import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const path = "supabase/migrations/20260803005300_phase_c12_manager_recipient_designation.sql";
const sql = readFileSync(path, "utf8");
const table = sql.slice(sql.indexOf("CREATE TABLE erp.manager_review_recipient_configurations"), sql.indexOf("ALTER TABLE erp.manager_review_recipient_configurations ENABLE ROW LEVEL SECURITY"));
const configure = sql.slice(sql.indexOf("CREATE FUNCTION erp.configure_manager_review_recipient"), sql.indexOf("CREATE OR REPLACE FUNCTION erp.resolve_manager_review_recipient"));
const resolver = sql.slice(sql.indexOf("CREATE OR REPLACE FUNCTION erp.resolve_manager_review_recipient"), sql.indexOf("ALTER FUNCTION erp.configure_manager_review_recipient"));

describe("C12 canonical Manager Review recipient designation", () => {
  it("stores one provider-neutral canonical user designation per tenant", () => {
    expect(sql).toContain("CREATE TABLE erp.manager_review_recipient_configurations");
    expect(sql).toContain("company_id text PRIMARY KEY REFERENCES erp.companies(id) ON DELETE CASCADE");
    expect(sql).toContain("FOREIGN KEY (company_id, user_id)");
    expect(sql).toContain("REFERENCES erp.users(company_id, id)");
    expect(table).not.toMatch(/recipient_email|destination text|username/);
  });

  it("separates permission eligibility from explicit recipient discovery", () => {
    expect(resolver).toContain("manager_review_recipient_configurations configuration");
    expect(resolver).toContain("target.id = designation.user_id");
    expect(resolver).toContain("permission.code = 'rental.approve'");
    expect(resolver).not.toMatch(/count\(\*\).*rental\.approve/s);
    expect(resolver).not.toMatch(/ORDER BY|LIMIT 1/);
  });

  it("rejects zero, inactive, cross-tenant, unqualified, and missing-email designations", () => {
    expect(resolver).toContain("configuration.company_id = target_company_id");
    expect(resolver).toContain("target.company_id = target_company_id");
    expect(resolver).toContain("target.status = 'active'");
    expect(resolver).toContain("'MANAGER_REVIEWER_NOT_CONFIGURED'");
    expect(resolver).toContain("'MANAGER_EMAIL_REQUIRED'");
    expect(resolver).toContain("candidate.email !~");
    expect(resolver).toContain("candidate.email ~ E'[\\\\r\\\\n]'");
    expect(resolver).toContain("lower(btrim(candidate.email))");
  });

  it("uses users.manage and derives tenant and actor canonically", () => {
    expect(configure).toContain("auth.uid()");
    expect(configure).toContain("erp.current_company_id()");
    expect(configure).toContain("erp.current_user_has_permission('users.manage')");
    expect(configure).not.toMatch(/company_id text|target_company|target_email|recipient_email/);
    expect(configure).toContain("WHERE id = target_user_id AND company_id = tenant AND status = 'active'");
  });

  it("supports removal and atomic reassignment without ambiguous active rows", () => {
    expect(configure).toContain("IF target_user_id IS NULL");
    expect(configure).toContain("DELETE FROM erp.manager_review_recipient_configurations");
    expect(configure).toContain("ON CONFLICT (company_id) DO UPDATE SET");
    expect(sql).toContain("company_id text PRIMARY KEY");
  });

  it("keeps configuration private and exposes only the authorized command", () => {
    expect(sql).toContain("ENABLE ROW LEVEL SECURITY");
    expect(sql).toMatch(/REVOKE ALL ON TABLE[\s\S]*FROM PUBLIC, anon, authenticated, service_role/);
    expect(sql).toContain("GRANT EXECUTE ON FUNCTION erp.configure_manager_review_recipient(uuid) TO authenticated");
    expect(sql).toContain("REVOKE ALL ON FUNCTION erp.resolve_manager_review_recipient(text)\n  FROM PUBLIC, anon, authenticated");
    expect(sql).toContain("GRANT EXECUTE ON FUNCTION erp.resolve_manager_review_recipient(text) TO service_role");
  });

  it("preserves explicit search paths and does not modify the frozen catalogs", () => {
    expect(configure).toContain("SET search_path = erp, auth, pg_catalog");
    expect(resolver).toContain("SET search_path = erp, auth, pg_catalog");
    expect(sql).not.toMatch(/INSERT INTO erp\.(app_roles|app_permissions|role_permissions)/);
    expect(sql).not.toMatch(/UPDATE erp\.(app_roles|app_permissions|role_permissions)/);
    expect(sql).not.toMatch(/DELETE FROM erp\.(app_roles|app_permissions|role_permissions)/);
  });

  it("keeps issuance caller-recipient-free and protected idempotency unchanged", () => {
    const authority = readFileSync("supabase/migrations/20260803004400_phase_c12_review_recipient_and_billing_evidence.sql", "utf8");
    const manager = authority.slice(authority.lastIndexOf("CREATE OR REPLACE FUNCTION command_create_manager_review_request"));
    expect(manager).toContain("resolve_manager_review_recipient(tenant)");
    expect(manager).toContain("'_canonicalRecipientUserId',resolved.user_id");
    expect(manager).toContain("'_canonicalRecipientDestination',lower(btrim(resolved.destination))");
    expect(manager).not.toContain("recipient.username");
  });
});
