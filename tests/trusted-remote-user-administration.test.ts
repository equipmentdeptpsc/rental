import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { SupabaseRemoteUserAdministration } from "@/integrations/supabase/SupabaseRemoteUserAdministration";

const migration=readFileSync("supabase/migrations/20260822000100_trusted_remote_user_administration.sql","utf8");
const serviceRoleReads=readFileSync("supabase/migrations/20260822000150_trusted_user_admin_service_role_reads.sql","utf8");
const worker=readFileSync("worker/userAdministration.ts","utf8");
const page=readFileSync("src/features/users/pages/UsersPage.tsx","utf8");

describe("trusted remote user administration",()=>{
  it("keeps privileged provisioning and password reset behind service-role-only commands",()=>{
    expect(migration).toContain("command_provision_application_user");
    expect(migration).toContain("record_application_user_password_reset");
    expect(migration).toMatch(/REVOKE ALL ON FUNCTION[\s\S]*FROM PUBLIC,anon,authenticated/);
    expect(migration).toMatch(/GRANT EXECUTE ON FUNCTION[\s\S]*TO service_role/);
    expect(migration).not.toMatch(/initialPassword|password[^_a-z].*(?:audit_log|new_values)/i);
  });
  it("enforces active caller, users.manage, tenant operator scope, canonical roles and idempotency",()=>{
    for(const evidence of ["u.status='active'","permission_code='users.manage'","o.company_id=tenant","erp.app_roles","user_provisioning_commands","IDEMPOTENCY_MISMATCH","USER_CREATED","USER_ROLE_ASSIGNED"])expect(migration).toContain(evidence);
    expect(worker).toContain("lookup_application_user_provisioning_command");
    expect(worker).not.toMatch(/command\.(?:companyId|actorId)/);
  });
  it("guards role shape, independently serializes normalized identities, and enforces tenant uniqueness",()=>{
    expect(migration).toContain("jsonb_typeof(command->'roleCodes') IS DISTINCT FROM 'array'");
    expect(migration).toContain("jsonb_typeof(item)<>'string'");
    expect(migration).toContain("tenant||':user-name:'||lower(username_value)");
    expect(migration).toContain("tenant||':user-email:'||email_value");
    expect(migration).toContain("uq_users_company_username");
    expect(migration).toContain("uq_users_company_email");
    for(const code of ["USERNAME_CONFLICT","EMAIL_CONFLICT","OPERATOR_CONFLICT","IDENTITY_CONFLICT"])expect(migration).toContain(code);
    expect(migration).toContain("EXCEPTION WHEN unique_violation");
  });
  it("serializes idempotency before every identity lock and command lookup",()=>{
    const idempotencyLock="tenant||':user-provisioning-idempotency:'||idem";
    const idempotencyPosition=migration.indexOf(idempotencyLock);
    const lookupPosition=migration.indexOf("SELECT * INTO existing FROM erp.user_provisioning_commands",idempotencyPosition);
    const usernamePosition=migration.indexOf("tenant||':user-name:'||lower(username_value)",idempotencyPosition);
    const emailPosition=migration.indexOf("tenant||':user-email:'||email_value",idempotencyPosition);
    const operatorPosition=migration.indexOf("tenant||':user-operator:'||operator_value",idempotencyPosition);
    expect(idempotencyPosition).toBeGreaterThan(-1);
    expect(lookupPosition).toBeGreaterThan(idempotencyPosition);
    expect(usernamePosition).toBeGreaterThan(lookupPosition);
    expect(emailPosition).toBeGreaterThan(usernamePosition);
    expect(operatorPosition).toBeGreaterThan(emailPosition);
  });
  it("matches constrained replay privileges without exposing raw command-table reads",()=>{
    expect(migration).toContain("lookup_application_user_provisioning_command");
    expect(migration).not.toMatch(/GRANT SELECT ON erp\.user_provisioning_commands/);
    expect(worker).not.toContain('.from("user_provisioning_commands")');
  });
  it("grants only the Worker service-role columns and preserves the command-table boundary",()=>{
    expect(serviceRoleReads).toContain("GRANT SELECT (id, company_id, status, operator_id) ON erp.users TO service_role");
    expect(serviceRoleReads).toContain("GRANT SELECT (user_id, permission_code) ON erp.effective_user_permissions TO service_role");
    expect(serviceRoleReads).toContain("GRANT SELECT (user_id, role_id) ON erp.user_roles TO service_role");
    expect(serviceRoleReads).toContain("GRANT SELECT (id, code) ON erp.app_roles TO service_role");
    expect(serviceRoleReads).toContain("GRANT SELECT (role_id, permission_id) ON erp.role_permissions TO service_role");
    expect(serviceRoleReads).toContain("GRANT SELECT (id, code) ON erp.app_permissions TO service_role");
    expect(serviceRoleReads).toContain("GRANT SELECT (id, company_id, status) ON erp.operators TO service_role");
    expect(serviceRoleReads).toContain("REVOKE SELECT ON erp.user_provisioning_commands FROM service_role");
    expect(serviceRoleReads).not.toMatch(/\bTO\s+(?:PUBLIC|anon|authenticated)\b/i);
    expect(serviceRoleReads).not.toMatch(/GRANT\s+SELECT\s+ON\s+erp\.user_provisioning_commands/i);
    expect(worker).toContain('.from("users").select("id,company_id,status")');
    expect(worker).toContain('.from("users").select("id,company_id,operator_id")');
    expect(worker).toContain('.from("effective_user_permissions").select("permission_code")');
    expect(worker).toContain('.from("app_roles").select("code")');
    expect(worker).toContain('.from("operators").select("id")');
  });
  it("compensates Auth creation when canonical provisioning fails and never reports compensation failure as success",()=>{
    expect(worker).toContain("auth.admin.deleteUser(auth.data.user.id)");
    expect(worker).toContain('code:compensation.error?"COMPENSATION_FAILED"');
    expect(worker).toContain("success:false");
  });
  it("uses remote read models and blocks unsupported remote mutations",()=>{
    for(const evidence of ["remoteAdmin.listUsers()","remoteAdmin.listRoles()","remoteAdmin.listOperators()","disabled={remote}"])expect(page).toContain(evidence);
    expect(page).toContain("service.create(actor,input)");
    expect(page).toContain("remoteAdmin.resetPassword");
  });
  it("sends minimum create input with the caller token and no privileged browser key",async()=>{
    const fetcher=vi.spyOn(globalThis,"fetch").mockResolvedValue(new Response(JSON.stringify({success:true,value:{id:"u"}}),{status:201,headers:{"content-type":"application/json"}}));
    const client={auth:{getSession:async()=>({data:{session:{access_token:"caller-jwt"}}})}};
    const repository=new SupabaseRemoteUserAdministration(client as never);
    await repository.create({displayName:"User",username:"user",email:"user@example.test",initialPassword:"Secret123",systemRoles:["operator"],operatorId:"op",commandId:"cmd",idempotencyKey:"idem"});
    const init=fetcher.mock.calls[0][1] as RequestInit;const sent=JSON.parse(String(init.body));
    expect((init.headers as Record<string,string>).authorization).toBe("Bearer caller-jwt");
    expect(sent).not.toHaveProperty("companyId");expect(sent).not.toHaveProperty("actorId");expect(sent).not.toHaveProperty("permissions");
    expect(JSON.stringify(sent)).not.toMatch(/service.role|sb_secret/i);fetcher.mockRestore();
  });
});
