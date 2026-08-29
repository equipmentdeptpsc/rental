import{describe,expect,it}from"vitest";
import{readFileSync}from"node:fs";

const worker=readFileSync("worker/uatMultiEquipmentProvisioner.ts","utf8");
const migration=readFileSync("supabase/migrations/20260829000700_isolated_uat_multi_equipment_provisioning_residue.sql","utf8");
describe("isolated UAT multi-equipment provisioner",()=>{
 it("is a fixed-profile, authenticated System Administrator-only UAT boundary",()=>{
  expect(worker).toContain('ENABLE_UAT_SYNTHETIC_PROVISIONER!=="true"');
  expect(worker).toContain('app_roles.code","system-administrator"');
  expect(worker).toContain('permission_code","settings.update');
  expect(worker).toContain('userRecord.data.company_id!==tenant');
  expect(worker).toContain('environment_class","compatibility');
  expect(worker).toContain('scenarioKey="MULTI-EQUIPMENT-RUNTIME-CERT-2026-08-29"');
  expect(worker).toContain('profile="UAT_MULTI_EQUIPMENT_PER_WORKDAY_V1"');
  expect(worker).toContain('Object.keys(body).some(key=>key!=="scenarioKey"&&key!=="profile")');
 });
 it("uses canonical commands rather than direct business-table writes",()=>{
  for(const name of["command_create_customer","command_create_project","command_create_work_description","command_create_operator","command_create_equipment","command_create_assignment","command_create_reserved_rental","command_prepare_reserved_rental_aggregate","command_release_rental","command_activate_rental"])expect(worker).toContain(`"${name}"`);
  expect(worker).not.toMatch(/\.from\("(?:rentals|rental_equipment_lines|equipment|assignments)"\)\.(?:insert|update|delete)/);
 });
 it("persists one tenant-scoped idempotency residue without granting browser access",()=>{
  expect(migration).toContain("PRIMARY KEY(company_id,scenario_key)");
  expect(migration).toContain("environment_class='compatibility'");
  expect(migration).toContain("REVOKE ALL ON erp.uat_multi_equipment_provisioning_scenarios FROM PUBLIC,anon,authenticated");
  expect(migration).toContain("GRANT EXECUTE ON FUNCTION erp.claim_isolated_uat_multi_equipment_provisioning");
  expect(migration).toContain("TO service_role");
 });
 it("keeps historical MVP and prohibited lifecycle artifacts out of the provisioner",()=>{
  expect(worker).not.toContain("RNT-2026-000001");
  for(const forbidden of["command_create_deur","dispatchExistingNotification","billing_statement","command_return_rental"])expect(worker).not.toContain(forbidden);
 });
});
