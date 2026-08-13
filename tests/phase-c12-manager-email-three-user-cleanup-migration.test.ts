import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const sql=readFileSync(resolve(process.cwd(),"supabase/migrations/20260803005600_phase_c12_manager_email_cleanup_three_user_authorization.sql"),"utf8");

describe("C12 Manager three-user cleanup boundary",()=>{
  it("is the forward 05600 replacement with the exact owner-only boundary",()=>{
    expect(sql).toContain("CREATE OR REPLACE FUNCTION erp.cleanup_c12_manager_real_email_fixture");
    expect(sql).toContain("TENANT-UAT-C12-MANAGER-EMAIL-001");
    expect(sql).toContain("CONFIRM-C12-MANAGER-EMAIL-CLEANUP");
    expect(sql).toContain("session_user <> database_owner OR current_user <> database_owner");
    expect(sql).toContain("SECURITY DEFINER SET search_path = erp, pg_catalog");
    expect(sql).toContain("FROM PUBLIC,anon,authenticated,service_role");
  });
  it("supports exactly three controlled users and role assignments",()=>{
    expect(sql).toContain("FROM users WHERE company_id=target_tenant_id) > 3");
    expect(sql).toContain("u.company_id=target_tenant_id) > 3");
    expect(sql).toContain("ROLE-CANON-SYSTEM-ADMINISTRATOR");
    expect(sql).toContain("ROLE-CANON-RENTAL-OPERATIONS");
    expect(sql).toContain("unexpected manager authorization identity shape exists");
    expect(sql).toContain("operator_id IS NOT NULL) > 1");
  });
  it("removes only the exact same-company designation before roles, users, and company",()=>{
    const designation=sql.indexOf("DELETE FROM manager_review_recipient_configurations WHERE company_id=target_tenant_id");
    const roles=sql.indexOf("DELETE FROM user_roles ur USING users u");
    const users=sql.indexOf("DELETE FROM users WHERE company_id=target_tenant_id");
    const company=sql.indexOf("DELETE FROM companies WHERE id=target_tenant_id");
    expect(designation).toBeGreaterThan(0); expect(designation).toBeLessThan(roles); expect(roles).toBeLessThan(users); expect(users).toBeLessThan(company);
    expect(sql).toContain("manager_designations");
  });
  it("preserves immutable, financial, business-shape, and local-tenant guards",()=>{
    for(const marker of ["erp.c12_manager_email_fixture_cleanup","billing_statements","billing_statement_lines","collections c","recovery_compensations","maintenance_records","equipment_daily_logs","TENANT-LOCAL-001","unexpected extra manager email fixture data exists"]) expect(sql).toContain(marker);
  });
  it("does not touch Auth, shared catalogs, triggers, replication, or wildcard tenants",()=>{
    expect(sql).not.toMatch(/(?:INSERT|UPDATE|DELETE)[\s\S]{0,30}auth\.users/i);
    expect(sql).not.toMatch(/session_replication_role|DISABLE\s+TRIGGER|TENANT-UAT-%/i);
    expect(sql).not.toMatch(/DELETE FROM (?:erp\.)?(?:app_roles|app_permissions|role_permissions)/i);
  });
  it("retains aggregate-only idempotent zero-state behavior",()=>{
    expect(sql).toContain("removed jsonb = '{}'::jsonb");
    expect(sql).toContain("RETURN removed");
    expect(sql).toContain("GET DIAGNOSTICS affected=ROW_COUNT");
  });
});
