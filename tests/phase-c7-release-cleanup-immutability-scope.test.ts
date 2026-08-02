import fs from "node:fs";
import path from "node:path";
import { describe,expect,it } from "vitest";

const sql=fs.readFileSync(path.resolve("supabase/migrations/20260802003800_phase_c7_release_cleanup_immutability_scope.sql"),"utf8");
describe("C7 release cleanup immutable-history scope",()=>{
  it("permits only owner deletes in the exact transaction-local release cleanup context",()=>{
    expect(sql).toContain("session_user=database_owner AND current_user=database_owner");
    expect(sql).toContain("current_setting('erp.c7_release_fixture_cleanup',true)='TENANT-UAT-C7-RELEASE-001'");
    expect(sql).toContain("target_company='TENANT-UAT-C7-RELEASE-001'");
    expect(sql).not.toMatch(/DISABLE\s+TRIGGER|session_replication_role/i);
  });
  it("derives tenant ownership for immutable child tables without caller input",()=>{
    expect(sql).toContain("TG_TABLE_NAME='commercial_snapshots'");
    expect(sql).toContain("FROM rentals WHERE id=row_data->>'rental_id'");
    expect(sql).toContain("TG_TABLE_NAME='deur_activity_logs'");
    expect(sql).toContain("FROM deurs WHERE id=row_data->>'deur_id'");
    expect(sql).toContain("TG_TABLE_NAME='equipment_history'");
    expect(sql).toContain("FROM equipment WHERE id=row_data->>'equipment_id'");
  });
  it("keeps review, notification, recovery, audit, snapshot, and billing immutability outside cleanup",()=>{
    for(const fn of ["reject_immutable_change","reject_customer_review_evidence_change","reject_manager_review_outcome_change","reject_terminal_notification_change","protect_statement_line"]){
      expect(sql).toContain(`FUNCTION ${fn}`);
    }
    expect(sql).toContain("immutable historical record cannot be changed");
    expect(sql).toContain("customer review evidence is immutable");
    expect(sql).toContain("manager review evidence is immutable");
    expect(sql).toContain("provider-accepted notification evidence is immutable");
    expect(sql).toContain("non-draft billing evidence is immutable");
  });
  it("revokes direct execution of every trigger function",()=>{
    expect(sql.match(/REVOKE ALL ON FUNCTION/g)).toHaveLength(5);
    expect(sql.match(/FROM PUBLIC,anon,authenticated,service_role/g)).toHaveLength(5);
  });
});
