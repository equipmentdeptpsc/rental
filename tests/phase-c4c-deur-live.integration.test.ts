import { randomBytes } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  assertSupabaseFixtureMutationAllowed,
  createSupabasePhaseC2Harness,
  readSupabasePhaseC2TestConfiguration,
} from "./support/supabasePhaseC2Harness";
import { executePhaseC4bPrivilegedSql } from "./support/phaseC4bPrivilegedSql";

const configuration = readSupabasePhaseC2TestConfiguration();
const enabled = configuration.enabled && process.env.RUN_PHASE_C4C_LIVE === "true";
const tenant = "TENANT-UAT-C4C-DEUR";
const userId = "7c4c0000-0000-4000-8000-000000000001";
const email = "tenant-uat-c4c-operator@example.invalid";
const password = `C4C-${randomBytes(24).toString("base64url")}`;

describe.skipIf(!enabled)("Phase C4C live DEUR completeness", () => {
  const harness = enabled ? createSupabasePhaseC2Harness(configuration) : undefined;
  let client: SupabaseClient;

  function owner(sql: string) {
    return executePhaseC4bPrivilegedSql(configuration, { tenantIds: [tenant], sql });
  }

  function cleanup() {
    owner(`
      BEGIN;
      SET LOCAL session_replication_role='replica';
      DELETE FROM erp.customer_review_requests WHERE company_id='${tenant}';
      DELETE FROM erp.deur_review_history WHERE company_id='${tenant}';
      DELETE FROM erp.deur_meter_checkpoints WHERE company_id='${tenant}';
      DELETE FROM erp.deur_activity_logs WHERE deur_id LIKE 'UAT-C4C-%';
      DELETE FROM erp.deur_events WHERE company_id='${tenant}';
      DELETE FROM erp.deur_command_idempotency WHERE company_id='${tenant}';
      DELETE FROM erp.operational_command_idempotency WHERE company_id='${tenant}';
      DELETE FROM erp.audit_log WHERE company_id='${tenant}';
      DELETE FROM erp.deurs WHERE company_id='${tenant}';
      DELETE FROM erp.commercial_snapshots WHERE rental_id='UAT-C4C-RENTAL';
      DELETE FROM erp.rental_equipment_lines WHERE company_id='${tenant}';
      DELETE FROM erp.rentals WHERE company_id='${tenant}';
      DELETE FROM erp.assignments WHERE company_id='${tenant}';
      DELETE FROM erp.equipment WHERE company_id='${tenant}';
      DELETE FROM erp.operators WHERE company_id='${tenant}';
      DELETE FROM erp.projects WHERE company_id='${tenant}';
      DELETE FROM erp.customers WHERE company_id='${tenant}';
      DELETE FROM erp.user_roles WHERE user_id='${userId}'::uuid;
      DELETE FROM erp.users WHERE company_id='${tenant}';
      DELETE FROM erp.role_permissions WHERE role_id='ROLE-UAT-C4C';
      DELETE FROM erp.app_roles WHERE id='ROLE-UAT-C4C';
      DELETE FROM erp.app_permissions WHERE id LIKE 'PERM-UAT-C4C-%';
      DELETE FROM erp.companies WHERE id='${tenant}';
      COMMIT;
    `);
  }

  beforeAll(async () => {
    assertSupabaseFixtureMutationAllowed(configuration, [tenant]);
    cleanup();
    const created = await harness!.admin.auth.admin.createUser({
      id: userId, email, password, email_confirm: true,
    });
    if (created.error || !created.data.user) throw created.error ?? new Error("C4C Auth user creation failed.");
    owner(`
      BEGIN;
      INSERT INTO erp.companies(id,code,name,environment_class) VALUES('${tenant}','${tenant}','C4C DEUR','test');
      INSERT INTO erp.operators(id,name,status,company_id) VALUES('UAT-C4C-OP','Operator','Active','${tenant}');
      INSERT INTO erp.users(id,username,display_name,status,operator_id,company_id)
        VALUES('${userId}'::uuid,'${email}','C4C Operator','active','UAT-C4C-OP','${tenant}');
      INSERT INTO erp.app_roles(id,code,name) VALUES('ROLE-UAT-C4C','rental-operations-c4c','C4C');
      INSERT INTO erp.app_permissions(id,code,name) VALUES
        ('PERM-UAT-C4C-CREATE','deur.create','DEUR Create'),
        ('PERM-UAT-C4C-REVIEW','deur.review','DEUR Review'),
        ('PERM-UAT-C4C-CORRECT','deur.correct','DEUR Correct');
      INSERT INTO erp.role_permissions(role_id,permission_id)
        SELECT 'ROLE-UAT-C4C',id FROM erp.app_permissions WHERE id LIKE 'PERM-UAT-C4C-%';
      INSERT INTO erp.user_roles(user_id,role_id) VALUES('${userId}'::uuid,'ROLE-UAT-C4C');
      INSERT INTO erp.customers(id,customer_code,name,company_id)
        VALUES('UAT-C4C-CUSTOMER','UAT-C4C-CUST','Customer','${tenant}');
      INSERT INTO erp.projects(id,project_code,name,customer_id,company_id)
        VALUES('UAT-C4C-PROJECT','UAT-C4C-PROJ','Project','UAT-C4C-CUSTOMER','${tenant}');
      INSERT INTO erp.equipment(id,asset_no,equipment_name,maintenance_type,company_id) VALUES
        ('UAT-C4C-EQ','UAT-C4C-EQ','Equipment','None','${tenant}'),
        ('UAT-C4C-EQ2','UAT-C4C-EQ2','Correction Equipment','None','${tenant}');
      INSERT INTO erp.assignments(id,equipment_id,operator_id,project_id,assigned_date,expected_return,status,company_id)
        VALUES('UAT-C4C-ASG','UAT-C4C-EQ','UAT-C4C-OP','UAT-C4C-PROJECT','2026-07-29','2026-08-29','Active','${tenant}');
      INSERT INTO erp.rentals(id,rental_number,customer_id,project_id,customer_snapshot,project_snapshot,date_out,rental_type,status,company_id)
        VALUES('UAT-C4C-RENTAL','UAT-C4C-R','UAT-C4C-CUSTOMER','UAT-C4C-PROJECT','Customer','Project','2026-07-29','Operated Rental','Active','${tenant}');
      INSERT INTO erp.rental_equipment_lines(id,rental_id,equipment_id,assignment_id,operator_id,status,company_id) VALUES
        ('UAT-C4C-LINE','UAT-C4C-RENTAL','UAT-C4C-EQ','UAT-C4C-ASG','UAT-C4C-OP','Active','${tenant}'),
        ('UAT-C4C-LINE2','UAT-C4C-RENTAL','UAT-C4C-EQ2',NULL,'UAT-C4C-OP','Active','${tenant}');
      INSERT INTO erp.deurs(id,deur_number,rental_id,rental_equipment_line_id,equipment_id,operator_id,project_id,customer_id,
        work_date,status,evidence_mode,total_operating_minutes,total_idle_minutes,company_id)
        VALUES('UAT-C4C-SOURCE','UAT-C4C-SOURCE','UAT-C4C-RENTAL','UAT-C4C-LINE2','UAT-C4C-EQ2','UAT-C4C-OP',
          'UAT-C4C-PROJECT','UAT-C4C-CUSTOMER','2026-07-28','Submitted','TIME_TIMELINE',120,0,'${tenant}');
      COMMIT;
    `);
    client = createClient(configuration.url!, configuration.publishableKey!, {
      auth: { persistSession: false, autoRefreshToken: false, storageKey: "c4c-deur" },
    });
    const login = await client.auth.signInWithPassword({ email, password });
    if (login.error) throw login.error;
  }, 45_000);

  afterAll(async () => {
    await client?.auth.signOut();
    cleanup();
    cleanup();
    await harness!.admin.auth.admin.deleteUser(userId);
  }, 45_000);

  it("uses the owner-only clock for an overnight operation/standby lifecycle", async () => {
    const output = owner(`
      BEGIN;
      SELECT set_config('request.jwt.claim.sub','${userId}',true);
      SELECT set_config('erp.c4c_test_clock','2026-07-29T23:50:00Z',true);
      SELECT erp.command_start_deur_shift('{"commandId":"C4C-START","idempotencyKey":"C4C-START",
        "rentalId":"UAT-C4C-RENTAL","rentalLineId":"UAT-C4C-LINE","assignmentId":"UAT-C4C-ASG",
        "equipmentId":"UAT-C4C-EQ","operatorId":"UAT-C4C-OP","deviceId":"C4C",
        "draft":{"id":"UAT-C4C-OVERNIGHT","workDate":"2026-07-29","shift":"Night","evidenceMode":"TIME_TIMELINE"}}'::jsonb);
      SELECT set_config('erp.c4c_test_clock','2026-07-30T00:10:00Z',true);
      UPDATE erp.deur_events SET is_open=false WHERE deur_id='UAT-C4C-OVERNIGHT' AND activity_type='operation' AND is_open;
      INSERT INTO erp.deur_events(id,deur_id,activity_type,action,occurred_at,sequence,source,actor_id,server_accepted_at,is_open,company_id)
      VALUES('UAT-C4C-EVENT-3','UAT-C4C-OVERNIGHT','operation','end',clock_timestamp(),3,'server','${userId}',clock_timestamp(),false,'${tenant}'),
        ('UAT-C4C-EVENT-4','UAT-C4C-OVERNIGHT','standby','start',clock_timestamp(),4,'server','${userId}',clock_timestamp(),true,'${tenant}');
      SELECT set_config('erp.c4c_test_clock','2026-07-30T01:10:00Z',true);
      UPDATE erp.deur_events SET is_open=false WHERE deur_id='UAT-C4C-OVERNIGHT' AND activity_type='standby' AND is_open;
      INSERT INTO erp.deur_events(id,deur_id,activity_type,action,occurred_at,sequence,source,actor_id,server_accepted_at,is_open,company_id)
      VALUES('UAT-C4C-EVENT-5','UAT-C4C-OVERNIGHT','standby','end',clock_timestamp(),5,'server','${userId}',clock_timestamp(),false,'${tenant}'),
        ('UAT-C4C-EVENT-6','UAT-C4C-OVERNIGHT','operation','start',clock_timestamp(),6,'server','${userId}',clock_timestamp(),true,'${tenant}');
      SELECT set_config('erp.c4c_test_clock','2026-07-30T01:40:00Z',true);
      UPDATE erp.deur_events SET is_open=false WHERE deur_id='UAT-C4C-OVERNIGHT' AND is_open;
      INSERT INTO erp.deur_events(id,deur_id,activity_type,action,occurred_at,sequence,source,actor_id,server_accepted_at,is_open,company_id)
      VALUES('UAT-C4C-EVENT-7','UAT-C4C-OVERNIGHT','operation','end',clock_timestamp(),7,'server','${userId}',clock_timestamp(),false,'${tenant}'),
        ('UAT-C4C-EVENT-8','UAT-C4C-OVERNIGHT','shift','end',clock_timestamp(),8,'server','${userId}',clock_timestamp(),false,'${tenant}');
      SELECT jsonb_build_object('success',true);
      COMMIT;
    `);
    if (/"success"\s*:\s*false/.test(output)) throw new Error(`Overnight command rejected: ${output}`);
    const events = await client.schema("erp").from("deur_events")
      .select("activity_type,action,occurred_at,sequence,is_open")
      .eq("deur_id", "UAT-C4C-OVERNIGHT").order("sequence");
    expect(events.error).toBeNull();
    expect(events.data?.map(({ activity_type, action }) => `${activity_type}:${action}`)).toEqual([
      "shift:start", "operation:start", "operation:end", "standby:start",
      "standby:end", "operation:start", "operation:end", "shift:end",
    ]);
    expect(events.data?.every((event) => !event.is_open)).toBe(true);
    const deur = await client.schema("erp").from("deurs")
      .select("total_operating_minutes,total_idle_minutes,total_standby_minutes,row_version")
      .eq("id", "UAT-C4C-OVERNIGHT").single();
    expect(deur.data).toMatchObject({
      total_operating_minutes: 50, total_idle_minutes: 0, total_standby_minutes: 60,
    });
  }, 30_000);

  it("applies an authenticated allowlisted correction and rejects changed-payload reuse", async () => {
    const created = await client.schema("erp").rpc("command_create_deur_correction", {
      command: { commandId: "C4C-CORRECT", idempotencyKey: "C4C-CORRECT", sourceRevisionId: "UAT-C4C-SOURCE",
        expectedVersion: 1, reasonCode: "INCORRECT_TIME_ENTRY", reasonDetails: "Correct overnight evidence." },
    });
    if (created.error) throw new Error(`Correction creation failed: ${created.error.code} ${created.error.message}`);
    expect(created.data?.success).toBe(true);
    const revisionId = created.data.value.revisionId as string;
    const patch = {
      events: [
        { sequence: 1, activityType: "shift", action: "start", timestamp: "2026-07-28T23:00:00Z" },
        { sequence: 2, activityType: "operation", action: "start", timestamp: "2026-07-28T23:00:00Z" },
        { sequence: 3, activityType: "operation", action: "end", timestamp: "2026-07-29T01:00:00Z" },
        { sequence: 4, activityType: "shift", action: "end", timestamp: "2026-07-29T01:00:00Z" },
      ], openingMeter: 100, closingMeter: 120, projectId: "UAT-C4C-PROJECT",
      reason: "Corrected against signed operator evidence.",
    };
    const applied = await client.schema("erp").rpc("command_apply_deur_correction", {
      command: { commandId: "C4C-APPLY", idempotencyKey: "C4C-APPLY", revisionId, expectedVersion: 1, patch },
    });
    if (applied.error) throw new Error(`Correction patch failed: ${applied.error.code} ${applied.error.message}`);
    expect(applied.data).toMatchObject({ success: true, disposition: "ACCEPTED" });
    expect(applied.data.value).toMatchObject({ operationMinutes: 120, idleMinutes: 0, standbyMinutes: 0 });
    const mismatch = await client.schema("erp").rpc("command_apply_deur_correction", {
      command: { commandId: "C4C-APPLY-OTHER", idempotencyKey: "C4C-APPLY", revisionId, expectedVersion: applied.data.value.version,
        patch: { ...patch, closingMeter: 121 } },
    });
    expect(mismatch.data).toMatchObject({ success: false, code: "IDEMPOTENCY_MISMATCH" });
  });

  it("does not expose the deterministic clock to anonymous or authenticated API callers", async () => {
    const anonymous = await harness!.anonymous.schema("erp").rpc("deur_operational_clock");
    const authenticated = await client.schema("erp").rpc("deur_operational_clock");
    expect(anonymous.error).not.toBeNull();
    expect(authenticated.error).not.toBeNull();
  });
});
