import fs from "node:fs";import path from "node:path";import{describe,expect,it}from"vitest";
const sql=fs.readFileSync(path.resolve("supabase/migrations/20260802004100_phase_c7_normalization_certification_cleanup.sql"),"utf8");
describe("exact C7 normalization cleanup",()=>{
 it("is exact-tenant and owner-session guarded",()=>{expect(sql).toContain("TENANT-UAT-C7-NORMALIZE-001");expect(sql).toContain("CONFIRM-C7-NORMALIZATION-CLEANUP");expect(sql).toContain("session_user<>database_owner");expect(sql).toContain("environment_class<>'test'");expect(sql).toContain("TENANT-LOCAL-001");});
 it("covers normalization evidence and dependencies",()=>{for(const table of ["notification_delivery_attempts","customer_review_outcomes","manager_review_outcomes","recovery_compensations","deur_events","deurs","collections","billing_statement_lines","commercial_snapshots","operational_command_idempotency","audit_log","rental_equipment_lines","rentals","users","companies"])expect(sql).toContain(`DELETE FROM ${table}`);});
 it("keeps the cleanup private and adds only an exact immutable-history exception",()=>{expect(sql).toContain("FROM PUBLIC,anon,authenticated,service_role");expect(sql).toContain("erp.c7_normalization_fixture_cleanup");expect(sql).not.toMatch(/LIKE 'TENANT-UAT-%'/);});
});
