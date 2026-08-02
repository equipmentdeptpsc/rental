import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  assertSupabaseFixtureMutationAllowed,
  createSupabasePhaseC2Harness,
  readSupabasePhaseC2TestConfiguration,
} from "./support/supabasePhaseC2Harness";
import { executePhaseC4bPrivilegedSql } from "./support/phaseC4bPrivilegedSql";

const configuration = readSupabasePhaseC2TestConfiguration();
const enabled = configuration.enabled && process.env.RUN_PHASE_C733A_LIVE === "true";
const tenant = "TENANT-UAT-C7-RELEASE-001";
const email = "c733a-release-cleanup@example.invalid";

describe.skipIf(!enabled)("Phase C7.3.3A exact-scoped live cleanup", () => {
  const harness = enabled ? createSupabasePhaseC2Harness(configuration) : undefined;
  const password = `C733A-${randomBytes(24).toString("base64url")}`;
  let authUserId = "";

  function owner(sql: string): string {
    return executePhaseC4bPrivilegedSql(configuration, { tenantIds: [tenant], sql });
  }

  function cleanupErp(): void {
    owner(`SELECT erp.cleanup_c7_release_certification_fixture(
      '${tenant}','${tenant}','CONFIRM-C7-RELEASE-CLEANUP');`);
  }

  beforeAll(async () => {
    assertSupabaseFixtureMutationAllowed(configuration, [tenant]);
    expect(process.env.VITE_REMOTE_OPERATIONAL_WRITES_ENABLED).toBe("false");
    cleanupErp();
    const existing = await harness!.admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    if (existing.error) throw existing.error;
    for (const user of existing.data.users.filter((candidate) => candidate.email === email)) {
      const removed = await harness!.admin.auth.admin.deleteUser(user.id);
      if (removed.error) throw removed.error;
    }
    const created = await harness!.admin.auth.admin.createUser({ email, password, email_confirm: true });
    if (created.error || !created.data.user) throw created.error ?? new Error("Auth fixture user was not created.");
    authUserId = created.data.user.id;
    owner(`
      BEGIN;
      INSERT INTO erp.companies(id,code,name,environment_class)
      VALUES('${tenant}','${tenant}','C7 Release Cleanup','test');
      INSERT INTO erp.operators(id,name,status,company_id)
      VALUES('OPR-UAT-C7-RELEASE-001','Release Operator','Active','${tenant}');
      INSERT INTO erp.users(id,username,display_name,status,operator_id,company_id)
      VALUES('${authUserId}'::uuid,'c733a-release-cleanup','Release Cleanup User','active','OPR-UAT-C7-RELEASE-001','${tenant}');
      INSERT INTO erp.customers(id,customer_code,name,company_id)
      VALUES('CUST-UAT-C7-RELEASE-001','C7-RELEASE-001','Release Customer','${tenant}');
      INSERT INTO erp.projects(id,project_code,name,customer_id,company_id)
      VALUES('PRJ-UAT-C7-RELEASE-001','C7-RELEASE-001','Release Project','CUST-UAT-C7-RELEASE-001','${tenant}');
      INSERT INTO erp.equipment(id,asset_no,equipment_name,maintenance_type,company_id)
      VALUES('EQP-UAT-C7-RELEASE-001','C7-RELEASE-001','Release Equipment','None','${tenant}');
      INSERT INTO erp.assignments(id,equipment_id,operator_id,project_id,assigned_date,expected_return,status,company_id)
      VALUES('ASN-UAT-C7-RELEASE-001','EQP-UAT-C7-RELEASE-001','OPR-UAT-C7-RELEASE-001','PRJ-UAT-C7-RELEASE-001',current_date,current_date+30,'Active','${tenant}');
      INSERT INTO erp.rentals(id,rental_number,customer_id,project_id,customer_snapshot,project_snapshot,date_out,rental_type,status,company_id)
      VALUES('RENT-UAT-C7-RELEASE-001','C7-RELEASE-001','CUST-UAT-C7-RELEASE-001','PRJ-UAT-C7-RELEASE-001','Release Customer','Release Project',current_date,'Operated Rental','Reserved','${tenant}');
      INSERT INTO erp.rental_equipment_lines(id,rental_id,equipment_id,assignment_id,operator_id,status,company_id)
      VALUES('LINE-UAT-C7-RELEASE-001','RENT-UAT-C7-RELEASE-001','EQP-UAT-C7-RELEASE-001','ASN-UAT-C7-RELEASE-001','OPR-UAT-C7-RELEASE-001','Reserved','${tenant}');
      INSERT INTO erp.commercial_snapshots(id,rental_id,rental_equipment_line_id,billing_method,unit_rate,minimum_billable_hours,standby_rate,mobilization_fee,demobilization_fee,fuel_charge,operator_included,operator_rate,tax_rate,withholding_tax,currency,captured_at)
      VALUES('SNAP-UAT-C7-RELEASE-001','RENT-UAT-C7-RELEASE-001','LINE-UAT-C7-RELEASE-001','Per Hour',100,0,0,0,0,0,true,0,0,0,'PHP',clock_timestamp());
      INSERT INTO erp.deurs(id,deur_number,rental_id,rental_equipment_line_id,assignment_id,equipment_id,operator_id,project_id,customer_id,commercial_snapshot_id,work_date,status,evidence_mode,billing_method_snapshot,company_id)
      VALUES('DEUR-UAT-C7-RELEASE-001','C7-RELEASE-DEUR-001','RENT-UAT-C7-RELEASE-001','LINE-UAT-C7-RELEASE-001','ASN-UAT-C7-RELEASE-001','EQP-UAT-C7-RELEASE-001','OPR-UAT-C7-RELEASE-001','PRJ-UAT-C7-RELEASE-001','CUST-UAT-C7-RELEASE-001','SNAP-UAT-C7-RELEASE-001',current_date,'Draft','TIME_TIMELINE','Per Hour','${tenant}');
      INSERT INTO erp.deur_events(id,deur_id,activity_type,action,occurred_at,sequence,source,actor_id,is_open,company_id)
      VALUES('EVENT-UAT-C7-RELEASE-001','DEUR-UAT-C7-RELEASE-001','shift','start',clock_timestamp(),1,'user','${authUserId}',true,'${tenant}');
      INSERT INTO erp.audit_log(id,aggregate_type,aggregate_id,action,actor_id,occurred_at,company_id)
      VALUES('AUDIT-UAT-C7-RELEASE-001','Rental','RENT-UAT-C7-RELEASE-001','CERTIFICATION_FIXTURE','${authUserId}',clock_timestamp(),'${tenant}');
      INSERT INTO erp.operational_command_idempotency(company_id,actor_key,idempotency_key,command_type,target_aggregate_type,target_aggregate_id,payload_hash,command_status,safe_response)
      VALUES('${tenant}','${authUserId}','C7-RELEASE-CLEANUP-001','CERTIFICATION_FIXTURE','Rental','RENT-UAT-C7-RELEASE-001','fixture','COMPLETED','{}'::jsonb);
      COMMIT;
    `);
  }, 60_000);

  afterAll(async () => {
    try { cleanupErp(); } catch { /* preserve the original failure */ }
    if (authUserId) await harness!.admin.auth.admin.deleteUser(authUserId);
    try { cleanupErp(); } catch { /* preserve the original failure */ }
  }, 60_000);

  it("keeps ordinary immutable event deletion blocked", () => {
    owner(`DO $$ BEGIN
      BEGIN DELETE FROM erp.deur_events WHERE id='EVENT-UAT-C7-RELEASE-001';
        RAISE EXCEPTION 'ordinary immutable deletion unexpectedly succeeded';
      EXCEPTION WHEN SQLSTATE '55000' THEN NULL; END;
    END $$;`);
  });

  it("rehearses complete cleanup inside a rollback and restores the fixture", () => {
    owner(`
      BEGIN;
      DO $$ DECLARE removed jsonb; BEGIN
        removed := erp.cleanup_c7_release_certification_fixture('${tenant}','${tenant}','CONFIRM-C7-RELEASE-CLEANUP');
        IF (removed->>'deur_events')::int<>1 OR (removed->>'deurs')::int<>1
           OR (removed->>'rental_lines')::int<>1 OR (removed->>'rentals')::int<>1
           OR (removed->>'operational_commands')::int<>1 OR (removed->>'audit_rows')::int<>1
           OR (removed->>'application_users')::int<>1 OR (removed->>'tenants')::int<>1 THEN
          RAISE EXCEPTION 'rollback cleanup counts were incomplete';
        END IF;
        IF EXISTS(SELECT 1 FROM erp.companies WHERE id='${tenant}') THEN RAISE EXCEPTION 'tenant remained inside cleanup transaction'; END IF;
        IF (SELECT count(*) FROM erp.companies WHERE code='LOCAL' AND environment_class='compatibility')<>1 THEN RAISE EXCEPTION 'local invariant changed'; END IF;
      END $$;
      ROLLBACK;
      DO $$ BEGIN
        IF (SELECT count(*) FROM erp.companies WHERE id='${tenant}')<>1
           OR (SELECT count(*) FROM erp.deur_events WHERE company_id='${tenant}')<>1 THEN
          RAISE EXCEPTION 'rollback did not restore fixture';
        END IF;
      END $$;
    `);
  });

  it("cleans committed ERP data, removes Auth separately, and makes pass two a zero-count no-op", async () => {
    owner(`DO $$ DECLARE removed jsonb; BEGIN
      removed := erp.cleanup_c7_release_certification_fixture('${tenant}','${tenant}','CONFIRM-C7-RELEASE-CLEANUP');
      IF (removed->>'deur_events')::int<>1 OR (removed->>'deurs')::int<>1
         OR (removed->>'rental_lines')::int<>1 OR (removed->>'rentals')::int<>1
         OR (removed->>'assignments')::int<>1 OR (removed->>'application_users')::int<>1
         OR (removed->>'equipment')::int<>1 OR (removed->>'operators')::int<>1
         OR (removed->>'projects')::int<>1 OR (removed->>'customers')::int<>1
         OR (removed->>'operational_commands')::int<>1 OR (removed->>'audit_rows')::int<>1
         OR (removed->>'commercial_snapshots')::int<>1 OR (removed->>'tenants')::int<>1 THEN
        RAISE EXCEPTION 'cleanup pass one counts were incomplete';
      END IF;
    END $$;`);

    const deleted = await harness!.admin.auth.admin.deleteUser(authUserId);
    if (deleted.error) throw deleted.error;

    owner(`DO $$ DECLARE removed jsonb; BEGIN
      removed := erp.cleanup_c7_release_certification_fixture('${tenant}','${tenant}','CONFIRM-C7-RELEASE-CLEANUP');
      IF EXISTS(SELECT 1 FROM jsonb_each_text(removed) item WHERE item.value::int<>0) THEN
        RAISE EXCEPTION 'cleanup pass two was not a zero-count no-op';
      END IF;
      IF (SELECT count(*) FROM erp.companies WHERE code='LOCAL' AND environment_class='compatibility')<>1 THEN
        RAISE EXCEPTION 'local invariant changed after cleanup';
      END IF;
    END $$;`);

    const absent = await harness!.admin.auth.admin.getUserById(authUserId);
    expect(absent.data.user).toBeNull();
    expect(absent.error).toBeTruthy();
    authUserId = "";
  }, 60_000);
});
