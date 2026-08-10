import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration=readFileSync("supabase/migrations/20260803004600_phase_c12_manager_certification_cleanup.sql","utf8");

describe("C12 exact manager certification cleanup boundary",()=>{
  it("requires the exact tenant, code, and confirmation and rejects protected tenants",()=>{
    expect(migration).toContain("target_tenant_id IS DISTINCT FROM 'TENANT-UAT-C12-MANAGER-001'");
    expect(migration).toContain("expected_tenant_code IS DISTINCT FROM 'TENANT-UAT-C12-MANAGER-001'");
    expect(migration).toContain("CONFIRM-C12-MANAGER-CERTIFICATION-CLEANUP");
    expect(migration).toContain("'TENANT-LOCAL-001','TENANT-UAT-C4E-FINANCIAL'");
    expect(migration).not.toMatch(/LIKE\s+['"]TENANT-UAT|SIMILAR TO|~\s+['"]TENANT-UAT/i);
  });

  it("is owner-only with an explicit minimal path and no application grants",()=>{
    expect(migration).toContain("SECURITY DEFINER");
    expect(migration).toContain("SET search_path = erp, pg_catalog");
    expect(migration).toContain("session_user <> database_owner OR current_user <> database_owner");
    expect(migration).toContain("OWNER TO postgres");
    expect(migration).toMatch(/REVOKE ALL[\s\S]*FROM PUBLIC, anon, authenticated, service_role/);
  });

  it("blocks business residue and deletes only exact user roles, users, and company",()=>{
    for(const table of ["rentals","deurs","customer_review_requests","manager_review_requests","notification_outbox","billing_statements","audit_log","operational_command_idempotency"])
      expect(migration).toContain(`SELECT 1 FROM ${table} WHERE company_id = target_tenant_id`);
    expect(migration.match(/DELETE FROM /g)).toHaveLength(3);
    expect(migration).toContain("DELETE FROM user_roles ur USING users u");
    expect(migration).toContain("DELETE FROM users WHERE company_id = target_tenant_id");
    expect(migration).toContain("DELETE FROM companies");
    expect(migration).not.toMatch(/auth\.users|DELETE FROM (app_roles|app_permissions|role_permissions)/);
  });

  it("accepts only the canonical one-user one-role fixture and returns aggregate zero-capable counts",()=>{
    expect(migration).toContain("application_user_count > 1 OR user_role_count > 1");
    expect(migration).toContain("u.email = 'equipmentdept.psc@gmail.com'");
    expect(migration).toContain("permission.code = 'rental.approve'");
    expect(migration).toContain("application_user_count <> user_role_count");
    expect(migration).toContain("'companies', removed_companies");
    expect(migration).toContain("'application_users', removed_application_users");
    expect(migration).toContain("'user_roles', removed_user_roles");
    expect(migration).not.toMatch(/session_replication_role|DISABLE\s+TRIGGER|DISABLE\s+ROW\s+LEVEL\s+SECURITY/i);
  });

  it("preserves applied migrations 04400 and 04500 byte-for-byte",()=>{
    const hash=(path:string)=>createHash("sha256").update(readFileSync(path)).digest("hex");
    expect(hash("supabase/migrations/20260803004400_phase_c12_review_recipient_and_billing_evidence.sql")).toBe("dd9608ec631011a359c062397a2d180d835fada1201a6caeb63d5bb61cf6c125");
    expect(hash("supabase/migrations/20260803004500_phase_c12_c4e_customer_review_outcome_residue_cleanup.sql")).toBe("50c8c325975abfaaa43ef7ba1132f6fefad1137ca3e6d14107bf74930cbe86a6");
  });
});
