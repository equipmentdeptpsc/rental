import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe,expect,it } from "vitest";

const path="supabase/migrations/20260803004700_phase_c12_customer_email_certification_cleanup.sql";
const sql=readFileSync(path,"utf8");

describe("C12 exact customer-email fixture cleanup",()=>{
 it("uses only the exact tenant and confirmation and protects other certified tenants",()=>{
  expect(sql).toContain("target_tenant_id IS DISTINCT FROM 'TENANT-UAT-C12-CUSTOMER-EMAIL-001'");
  expect(sql).toContain("expected_tenant_code IS DISTINCT FROM 'TENANT-UAT-C12-CUSTOMER-EMAIL-001'");
  expect(sql).toContain("CONFIRM-C12-CUSTOMER-EMAIL-CLEANUP");
  for(const id of ["TENANT-LOCAL-001","TENANT-UAT-C4E-FINANCIAL","TENANT-UAT-C12-MANAGER-001"])expect(sql).toContain(id);
  expect(sql).not.toMatch(/LIKE\s+['"]TENANT-UAT|SIMILAR TO|~\s+['"]TENANT-UAT/i);
 });
 it("is owner-only, security-defined, and unavailable to application roles",()=>{
  expect(sql).toContain("SECURITY DEFINER SET search_path=erp,pg_catalog");
  expect(sql).toContain("session_user<>database_owner OR current_user<>database_owner");
  expect(sql).toContain("OWNER TO postgres");
  expect(sql).toMatch(/REVOKE ALL[\s\S]*FROM PUBLIC,anon,authenticated,service_role/);
 });
 it("uses exact transaction-local immutable exceptions while preserving ordinary denial",()=>{
  expect(sql.match(/erp\.c12_customer_email_fixture_cleanup/g)?.length).toBeGreaterThanOrEqual(5);
  expect(sql).toContain("TG_OP='DELETE'");
  expect(sql).toContain("customer review evidence is immutable");
  expect(sql).toContain("immutable historical record cannot be changed");
  expect(sql).not.toMatch(/session_replication_role|DISABLE\s+TRIGGER|DISABLE\s+ROW\s+LEVEL\s+SECURITY/i);
 });
 it("blocks billing, manager evidence, and excessive fixture cardinality",()=>{
  for(const table of ["billing_statements","billing_statement_lines","manager_review_requests","manager_review_outcomes","manager_correction_requests"])expect(sql).toContain(`FROM ${table} WHERE company_id=target_tenant_id`);
  expect(sql).toContain("unexpected billing or manager evidence exists");
  expect(sql).toContain("unexpected extra fixture data exists");
 });
 it("deletes in dependency order without touching Auth or shared authorization catalogs",()=>{
  const order=["notification_delivery_attempts","notification_outbox","customer_review_outcomes","customer_review_requests","deur_events","deurs","operational_command_idempotency","audit_log","commercial_snapshots","rental_equipment_lines","rentals","assignments","equipment","operators","projects","customers","user_roles","users","companies"];
  let previous=-1;for(const table of order){const index=sql.search(new RegExp(`DELETE FROM ${table}\\b`));expect(index).toBeGreaterThan(previous);previous=index;}
  expect(sql).not.toMatch(/DELETE FROM (auth\.users|app_roles|app_permissions|role_permissions)/);
 });
 it("returns aggregate zero-capable counts and preserves applied migrations",()=>{
  for(const key of ["notification_delivery_attempts","notification_outbox","customer_review_outcomes","customer_review_requests","deur_events","deurs","operational_commands","audit_rows","rental_lines","rentals","assignments","equipment","operators","projects","customers","user_roles","application_users","companies"])expect(sql).toContain(`'${key}'`);
  const hash=(p:string)=>createHash("sha256").update(readFileSync(p)).digest("hex");
  expect(hash("supabase/migrations/20260803004400_phase_c12_review_recipient_and_billing_evidence.sql")).toBe("dd9608ec631011a359c062397a2d180d835fada1201a6caeb63d5bb61cf6c125");
  expect(hash("supabase/migrations/20260803004500_phase_c12_c4e_customer_review_outcome_residue_cleanup.sql")).toBe("50c8c325975abfaaa43ef7ba1132f6fefad1137ca3e6d14107bf74930cbe86a6");
  expect(hash("supabase/migrations/20260803004600_phase_c12_manager_certification_cleanup.sql")).toBe("2753457ed84baf72e8ada355835336c9caf170d717070c2c613d69e4560dbc35");
 });
});
