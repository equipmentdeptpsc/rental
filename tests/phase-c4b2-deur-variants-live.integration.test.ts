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
const enabled = configuration.enabled && process.env.RUN_PHASE_C4B2_LIVE === "true";
const tenant = "TENANT-UAT-C4B2-DEUR";
const email = "tenant-uat-c4b2-operator@example.invalid";
const password = `C4B2-${randomBytes(24).toString("base64url")}`;

describe.skipIf(!enabled)("Phase C4B.2 supported live DEUR variants", () => {
  const admin = enabled ? createSupabasePhaseC2Harness(configuration) : undefined;
  let userId = "";
  let client: SupabaseClient;

  function cleanup() {
    executePhaseC4bPrivilegedSql(configuration, {
      tenantIds: [tenant],
      sql: `
        BEGIN;
        SET LOCAL session_replication_role='replica';
        DELETE FROM erp.customer_review_requests WHERE company_id='${tenant}';
        DELETE FROM erp.deur_review_history WHERE company_id='${tenant}';
        DELETE FROM erp.deur_meter_checkpoints WHERE company_id='${tenant}';
        DELETE FROM erp.deur_activity_logs WHERE deur_id LIKE 'UAT-C4B2-DEUR-%';
        DELETE FROM erp.deur_events WHERE company_id='${tenant}';
        DELETE FROM erp.deur_command_idempotency WHERE company_id='${tenant}';
        DELETE FROM erp.operational_command_idempotency WHERE company_id='${tenant}';
        DELETE FROM erp.audit_log WHERE company_id='${tenant}';
        DELETE FROM erp.deurs WHERE company_id='${tenant}';
        DELETE FROM erp.commercial_snapshots WHERE rental_id='UAT-C4B2-DEUR-RENTAL';
        DELETE FROM erp.rental_equipment_lines WHERE company_id='${tenant}';
        DELETE FROM erp.rentals WHERE company_id='${tenant}';
        DELETE FROM erp.assignments WHERE company_id='${tenant}';
        DELETE FROM erp.equipment WHERE company_id='${tenant}';
        DELETE FROM erp.operators WHERE company_id='${tenant}';
        DELETE FROM erp.projects WHERE company_id='${tenant}';
        DELETE FROM erp.customers WHERE company_id='${tenant}';
        DELETE FROM erp.user_roles WHERE user_id='${userId || "00000000-0000-0000-0000-000000000000"}'::uuid;
        DELETE FROM erp.users WHERE company_id='${tenant}';
        DELETE FROM erp.role_permissions WHERE role_id='ROLE-UAT-C4B2-DEUR';
        DELETE FROM erp.app_roles WHERE id='ROLE-UAT-C4B2-DEUR';
        DELETE FROM erp.app_permissions WHERE id LIKE 'PERM-UAT-C4B2-DEUR-%';
        DELETE FROM erp.companies WHERE id='${tenant}';
        COMMIT;
      `,
    });
  }

  beforeAll(async () => {
    assertSupabaseFixtureMutationAllowed(configuration, [tenant]);
    cleanup();
    const created = await admin!.admin.auth.admin.createUser({ email, password, email_confirm: true });
    if (created.error || !created.data.user) throw created.error ?? new Error("Operator Auth user creation failed.");
    userId = created.data.user.id;
    executePhaseC4bPrivilegedSql(configuration, {
      tenantIds: [tenant],
      sql: `
        BEGIN;
        INSERT INTO erp.companies(id,code,name,environment_class) VALUES('${tenant}','${tenant}','C4B2 DEUR','test');
        INSERT INTO erp.operators(id,name,status,company_id) VALUES('UAT-C4B2-DEUR-OP','Operator','Active','${tenant}');
        INSERT INTO erp.users(id,username,display_name,status,operator_id,company_id) VALUES('${userId}'::uuid,'${email}','C4B2 Operator','active','UAT-C4B2-DEUR-OP','${tenant}');
        INSERT INTO erp.app_roles(id,code,name) VALUES('ROLE-UAT-C4B2-DEUR','rental-operations','C4B2 DEUR');
        INSERT INTO erp.app_permissions(id,code,name) VALUES
          ('PERM-UAT-C4B2-DEUR-CREATE','deur.create','DEUR Create'),
          ('PERM-UAT-C4B2-DEUR-REVIEW','deur.review','DEUR Review'),
          ('PERM-UAT-C4B2-DEUR-CORRECT','deur.correct','DEUR Correct');
        INSERT INTO erp.role_permissions(role_id,permission_id)
          SELECT 'ROLE-UAT-C4B2-DEUR',id FROM erp.app_permissions WHERE id LIKE 'PERM-UAT-C4B2-DEUR-%';
        INSERT INTO erp.user_roles(user_id,role_id) VALUES('${userId}'::uuid,'ROLE-UAT-C4B2-DEUR');
        INSERT INTO erp.customers(id,customer_code,name,company_id) VALUES('UAT-C4B2-DEUR-CUSTOMER','UAT-C4B2-DEUR-CUST','Customer','${tenant}');
        INSERT INTO erp.projects(id,project_code,name,customer_id,company_id) VALUES('UAT-C4B2-DEUR-PROJECT','UAT-C4B2-DEUR-PROJ','Project','UAT-C4B2-DEUR-CUSTOMER','${tenant}');
        INSERT INTO erp.equipment(id,asset_no,equipment_name,maintenance_type,company_id) VALUES
          ('UAT-C4B2-DEUR-EQ','UAT-C4B2-DEUR-EQ','Equipment','None','${tenant}'),
          ('UAT-C4B2-DEUR-EQ2','UAT-C4B2-DEUR-EQ2','Equipment 2','None','${tenant}');
        INSERT INTO erp.assignments(id,equipment_id,operator_id,project_id,assigned_date,expected_return,status,company_id)
          VALUES('UAT-C4B2-DEUR-ASG','UAT-C4B2-DEUR-EQ','UAT-C4B2-DEUR-OP','UAT-C4B2-DEUR-PROJECT','2026-07-29','2026-08-29','Active','${tenant}');
        INSERT INTO erp.rentals(id,rental_number,customer_id,project_id,customer_snapshot,project_snapshot,date_out,rental_type,status,company_id)
          VALUES('UAT-C4B2-DEUR-RENTAL','UAT-C4B2-DEUR-R','UAT-C4B2-DEUR-CUSTOMER','UAT-C4B2-DEUR-PROJECT','Customer','Project','2026-07-29','Operated Rental','Active','${tenant}');
        INSERT INTO erp.rental_equipment_lines(id,rental_id,equipment_id,assignment_id,operator_id,status,company_id) VALUES
          ('UAT-C4B2-DEUR-LINE','UAT-C4B2-DEUR-RENTAL','UAT-C4B2-DEUR-EQ','UAT-C4B2-DEUR-ASG','UAT-C4B2-DEUR-OP','Active','${tenant}'),
          ('UAT-C4B2-DEUR-LINE2','UAT-C4B2-DEUR-RENTAL','UAT-C4B2-DEUR-EQ2',NULL,'UAT-C4B2-DEUR-OP','Active','${tenant}');
        INSERT INTO erp.deurs(id,deur_number,rental_id,rental_equipment_line_id,equipment_id,operator_id,project_id,customer_id,work_date,status,evidence_mode,total_operating_minutes,total_idle_minutes,company_id)
        VALUES
          ('UAT-C4B2-DEUR-METER','UAT-C4B2-DEUR-METER','UAT-C4B2-DEUR-RENTAL','UAT-C4B2-DEUR-LINE','UAT-C4B2-DEUR-EQ','UAT-C4B2-DEUR-OP','UAT-C4B2-DEUR-PROJECT','UAT-C4B2-DEUR-CUSTOMER','2026-07-29','Draft','TIME_TIMELINE',0,0,'${tenant}'),
          ('UAT-C4B2-DEUR-SOURCE','UAT-C4B2-DEUR-SOURCE','UAT-C4B2-DEUR-RENTAL','UAT-C4B2-DEUR-LINE2','UAT-C4B2-DEUR-EQ2','UAT-C4B2-DEUR-OP','UAT-C4B2-DEUR-PROJECT','UAT-C4B2-DEUR-CUSTOMER','2026-07-28','Submitted','TIME_TIMELINE',120,30,'${tenant}'),
          ('UAT-C4B2-DEUR-LOCKED','UAT-C4B2-DEUR-LOCKED','UAT-C4B2-DEUR-RENTAL','UAT-C4B2-DEUR-LINE2','UAT-C4B2-DEUR-EQ2','UAT-C4B2-DEUR-OP','UAT-C4B2-DEUR-PROJECT','UAT-C4B2-DEUR-CUSTOMER','2026-07-27','Acknowledged','TIME_TIMELINE',60,0,'${tenant}');
        UPDATE erp.deurs SET billing_locked=true WHERE id='UAT-C4B2-DEUR-LOCKED';
        COMMIT;
      `,
    });
    client = createClient(configuration.url!, configuration.publishableKey!, {
      auth: { persistSession: false, autoRefreshToken: false, storageKey: "c4b2-deur" },
    });
    const login = await client.auth.signInWithPassword({ email, password });
    if (login.error) throw login.error;
  }, 30_000);

  afterAll(async () => {
    await client?.auth.signOut();
    cleanup();
    cleanup();
    if (userId) await admin!.admin.auth.admin.deleteUser(userId);
  }, 30_000);

  it("records monotonic opening, intermediate, and closing checkpoints with replay and rollback denial", async () => {
    const base = { deurId: "UAT-C4B2-DEUR-METER", rentalLineId: "UAT-C4B2-DEUR-LINE", equipmentId: "UAT-C4B2-DEUR-EQ" };
    const opening = await client.schema("erp").rpc("command_record_meter_checkpoint", { command: { ...base, commandId: "C4B2-METER-OPEN", idempotencyKey: "C4B2-METER-OPEN", kind: "opening", reading: 100 } });
    expect(opening.data.success).toBe(true);
    const replay = await client.schema("erp").rpc("command_record_meter_checkpoint", { command: { ...base, commandId: "C4B2-METER-OPEN-RETRY", idempotencyKey: "C4B2-METER-OPEN", kind: "opening", reading: 100 } });
    expect(replay.data.disposition).toBe("REPLAYED");
    const checkpoint = await client.schema("erp").rpc("command_record_meter_checkpoint", { command: { ...base, commandId: "C4B2-METER-MID", idempotencyKey: "C4B2-METER-MID", kind: "checkpoint", reading: 150 } });
    expect(checkpoint.data.success).toBe(true);
    const decreasing = await client.schema("erp").rpc("command_record_meter_checkpoint", { command: { ...base, commandId: "C4B2-METER-BAD", idempotencyKey: "C4B2-METER-BAD", kind: "checkpoint", reading: 140 } });
    expect(decreasing.data).toMatchObject({ success: false, code: "VALIDATION_REJECTED" });
    const closing = await client.schema("erp").rpc("command_record_meter_checkpoint", { command: { ...base, commandId: "C4B2-METER-CLOSE", idempotencyKey: "C4B2-METER-CLOSE", kind: "closing", reading: 200 } });
    expect(closing.data.success).toBe(true);
    const rows = await client.schema("erp").from("deur_meter_checkpoints").select("kind,reading").eq("deur_id", base.deurId).order("reading");
    expect(rows.error).toBeNull();
    expect(rows.data).toEqual([{ kind: "opening", reading: 100 }, { kind: "checkpoint", reading: 150 }, { kind: "closing", reading: 200 }]);
  });

  it("creates one traceable correction revision, rejects stale reuse, and blocks locked correction", async () => {
    const correction = await client.schema("erp").rpc("command_create_deur_correction", {
      command: { commandId: "C4B2-CORRECT", idempotencyKey: "C4B2-CORRECT", sourceRevisionId: "UAT-C4B2-DEUR-SOURCE", expectedVersion: 1, reasonCode: "INCORRECT_TIME", reasonDetails: "Correct the recorded activity timeline." },
    });
    expect(correction.data.success).toBe(true);
    expect(correction.data.value).toMatchObject({ sourceRevisionId: "UAT-C4B2-DEUR-SOURCE", revisionNumber: 2, version: 1 });
    const replay = await client.schema("erp").rpc("command_create_deur_correction", {
      command: { commandId: "C4B2-CORRECT-RETRY", idempotencyKey: "C4B2-CORRECT", sourceRevisionId: "UAT-C4B2-DEUR-SOURCE", expectedVersion: 1, reasonCode: "INCORRECT_TIME", reasonDetails: "Correct the recorded activity timeline." },
    });
    expect(replay.data.disposition).toBe("REPLAYED");
    const stale = await client.schema("erp").rpc("command_create_deur_correction", {
      command: { commandId: "C4B2-CORRECT-STALE", idempotencyKey: "C4B2-CORRECT-STALE", sourceRevisionId: "UAT-C4B2-DEUR-SOURCE", expectedVersion: 1, reasonCode: "INCORRECT_TIME", reasonDetails: "Different correction attempt." },
    });
    expect(["CONFLICT", "INVALID_TRANSITION"]).toContain(stale.data.code);
    const locked = await client.schema("erp").rpc("command_create_deur_correction", {
      command: { commandId: "C4B2-CORRECT-LOCKED", idempotencyKey: "C4B2-CORRECT-LOCKED", sourceRevisionId: "UAT-C4B2-DEUR-LOCKED", expectedVersion: 2, reasonCode: "INCORRECT_TIME", reasonDetails: "Must remain blocked." },
    });
    expect(locked.data).toMatchObject({ success: false, code: "INVALID_TRANSITION" });
    const revisions = await client.schema("erp").from("deurs").select("id,revision_number,previous_revision_id,correction_reason_code,status").eq("revision_chain_id", "UAT-C4B2-DEUR-SOURCE");
    expect(revisions.error).toBeNull();
    expect(revisions.data).toHaveLength(1);
    expect(revisions.data![0]).toMatchObject({ revision_number: 2, previous_revision_id: "UAT-C4B2-DEUR-SOURCE", correction_reason_code: "INCORRECT_TIME", status: "Draft" });
  });
});
