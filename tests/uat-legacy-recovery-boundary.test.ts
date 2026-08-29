import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
const migration=readFileSync("supabase/migrations/20260829002300_isolated_uat_legacy_recovery_boundary.sql","utf8");
const worker=readFileSync("worker/uatLegacyRecovery.ts","utf8");
describe("isolated UAT legacy recovery boundary",()=>{
 it("is service-only, fixed-profile, and consumes the canonical lineage helper",()=>{
  expect(migration).toContain("auth.role()<>'service_role'"); expect(migration).toContain("inspect_isolated_uat_scenario_lineage"); expect(migration).toContain("state='FAILED'");
  for(const forbidden of ["command_create_reserved_rental","command_create_deur","notification_outbox SET","billing_statements SET","command_return"] ) expect(migration).not.toContain(forbidden);
 });
 it("derives tenant and actor server-side and rejects arbitrary inputs",()=>{
  expect(worker).toContain("auth.getUser(token)"); expect(worker).toContain('from("users")'); expect(worker).toContain('from("user_roles")'); expect(worker).toContain('"settings.update"'); expect(worker).toContain('"system-administrator"'); expect(worker).toContain("Object.keys(body).length!==2"); expect(worker).not.toContain("tenantId");
 });
 it("does not create a second attempt or permit live invocation in tests",()=>{
  expect(migration).toContain("EXECUTION_ALREADY_ATTEMPTED"); expect(migration).toContain("audit_exists"); expect(worker).toContain("recover_isolated_uat_legacy_provisioning");
 });
});
