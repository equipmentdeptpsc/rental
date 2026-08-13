import{readFileSync}from"node:fs";
import{describe,expect,it}from"vitest";

const path="supabase/migrations/20260803007600_phase_p5_scheduler_principal_provisioning_boundary.sql";
const sql=readFileSync(path,"utf8");

describe("P5 production scheduler-principal provisioning boundary",()=>{
 it("is an owner-session-only security-invoker boundary",()=>{
  expect(sql).toContain("session_user<>database_owner OR current_user<>database_owner");
  expect(sql).toContain("LANGUAGE plpgsql\nSET search_path=erp,pg_catalog");
  expect(sql).not.toContain("SECURITY DEFINER");
  expect(sql).toContain("OWNER TO postgres");
  expect(sql).toMatch(/REVOKE ALL[\s\S]*FROM PUBLIC,anon,authenticated,service_role/);
  expect(sql).not.toMatch(/GRANT EXECUTE/i);
 });

 it("accepts only an exact existing active approved production company",()=>{
  expect(sql).toContain("target_company_id<>btrim(target_company_id)");
  expect(sql).toContain("WHERE id=target_company_id FOR UPDATE");
  expect(sql).toContain("existing company required");
  expect(sql).toContain("target_company.environment_class<>'approved'");
  expect(sql).toContain("target_company_id='TENANT-LOCAL-001'");
  expect(sql).toContain("target_company_id LIKE 'TENANT-UAT-%'");
  expect(sql).toContain("'CONFIRM-P5-GROUPED-REVIEW-SCHEDULER:'||target_company_id");
 });

 it("fixes principal type and permission in the function contract",()=>{
  expect(sql).toContain("'GROUPED_REVIEW_SCHEDULER','Grouped Review Scheduler',true");
  expect(sql).toContain("VALUES(principal.id,'grouped_review.schedule')");
  expect(sql).not.toMatch(/principal_type\s+(?:text|uuid)|permission_(?:code|id)\s+(?:text|uuid)/i);
  expect(sql).not.toMatch(/role_id|auth\.users|actor email|RESEND|automation_enabled|local_send_time|Cron/i);
 });

 it("is deterministic and structurally idempotent",()=>{
  expect(sql).toContain("WHERE company_id=target_company_id AND principal_type='GROUPED_REVIEW_SCHEDULER'");
  expect(sql).toContain("FOR UPDATE");
  expect(sql).toContain("ON CONFLICT(principal_id,permission_code) DO NOTHING");
  expect(sql).toContain("scheduler principal postcondition failed");
  expect(sql).toContain("permission_code<>'grouped_review.schedule'");
 });

 it("attributes provisioning to the non-human system identity without enabling automation",()=>{
  expect(sql).toContain("'GROUPED_REVIEW_SCHEDULER_PRINCIPAL_PROVISIONED'");
  expect(sql).toContain("'actorType','SYSTEM'");
  expect(sql).toContain("'provisioningAuthority','DATABASE_OWNER'");
  expect(sql).not.toMatch(/INSERT INTO erp\.grouped_review_scheduler_configurations|UPDATE erp\.grouped_review_scheduler_configurations/i);
 });

 it("does not weaken enforcement or mutate external identities and providers",()=>{
  expect(sql).not.toMatch(/session_replication_role|DISABLE\s+(?:TRIGGER|ROW\s+LEVEL\s+SECURITY)|TRUNCATE/i);
  expect(sql).not.toMatch(/(?:INSERT|UPDATE|DELETE)\s+(?:INTO\s+|FROM\s+)?auth\.users/i);
  expect(sql).not.toMatch(/notification_outbox|notification_delivery_attempts|RESEND_API_KEY|SUPABASE_SERVICE_ROLE_KEY/i);
 });
});
