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
const enabled = configuration.enabled && process.env.RUN_PHASE_C4E_LIVE === "true";
const tenant = "TENANT-UAT-C4E-FINANCIAL";
const ids = {
  operations: "7c4e0000-0000-4000-8000-000000000001",
  finance: "7c4e0000-0000-4000-8000-000000000002",
} as const;
const password = `C4E-${randomBytes(24).toString("base64url")}`;
const email = (actor: keyof typeof ids) => `tenant-uat-c4e-${actor}@example.invalid`;

describe.skipIf(!enabled)("Phase C4E financial recovery lifecycle", () => {
  const harness = enabled ? createSupabasePhaseC2Harness(configuration) : undefined;
  const clients = {} as Record<keyof typeof ids, SupabaseClient>;
  let originalReviewToken = "";
  let correctedReviewToken = "";
  let revisionId = "";

  const owner = (sql: string) =>
    executePhaseC4bPrivilegedSql(configuration, { tenantIds: [tenant], sql });

  function cleanup() {
    owner(`
      BEGIN;
      SET LOCAL session_replication_role='replica';
      DELETE FROM erp.collections WHERE billing_statement_id IN (
        SELECT id FROM erp.billing_statements WHERE company_id='${tenant}'
      );
      DELETE FROM erp.customer_review_requests WHERE company_id='${tenant}';
      DELETE FROM erp.deur_review_history WHERE company_id='${tenant}';
      DELETE FROM erp.deur_meter_checkpoints WHERE company_id='${tenant}';
      DELETE FROM erp.deur_activity_logs WHERE deur_id LIKE 'UAT-C4E-%';
      DELETE FROM erp.deur_events WHERE company_id='${tenant}';
      DELETE FROM erp.deur_command_idempotency WHERE company_id='${tenant}';
      DELETE FROM erp.operational_command_idempotency WHERE company_id='${tenant}';
      DELETE FROM erp.audit_log WHERE company_id='${tenant}';
      DELETE FROM erp.billing_statement_lines WHERE company_id='${tenant}';
      DELETE FROM erp.recovery_compensations WHERE company_id='${tenant}';
      DELETE FROM erp.billing_statements WHERE company_id='${tenant}';
      DELETE FROM erp.deurs WHERE company_id='${tenant}';
      DELETE FROM erp.commercial_snapshots WHERE rental_id='UAT-C4E-RENTAL';
      DELETE FROM erp.rental_equipment_lines WHERE company_id='${tenant}';
      DELETE FROM erp.rentals WHERE company_id='${tenant}';
      DELETE FROM erp.assignments WHERE company_id='${tenant}';
      DELETE FROM erp.equipment WHERE company_id='${tenant}';
      DELETE FROM erp.operators WHERE company_id='${tenant}';
      DELETE FROM erp.projects WHERE company_id='${tenant}';
      DELETE FROM erp.customers WHERE company_id='${tenant}';
      DELETE FROM erp.user_roles WHERE user_id IN ('${ids.operations}'::uuid,'${ids.finance}'::uuid);
      DELETE FROM erp.users WHERE company_id='${tenant}';
      DELETE FROM erp.role_permissions WHERE role_id LIKE 'ROLE-UAT-C4E-%';
      DELETE FROM erp.app_roles WHERE id LIKE 'ROLE-UAT-C4E-%';
      DELETE FROM erp.app_permissions WHERE id LIKE 'PERM-UAT-C4E-%';
      DELETE FROM erp.companies WHERE id='${tenant}';
      COMMIT;
    `);
  }

  async function rpc(actor: keyof typeof ids, name: string, command: Record<string, unknown>) {
    const response = await clients[actor].schema("erp").rpc(name, { command });
    expect(response.error, `${name}: ${response.error?.code ?? ""} ${response.error?.message ?? ""}`).toBeNull();
    return response.data;
  }

  async function publicRpc(name: string, command: Record<string, unknown>) {
    const response = await harness!.anonymous.schema("erp").rpc(name, { command });
    expect(response.error, `${name}: ${response.error?.code ?? ""} ${response.error?.message ?? ""}`).toBeNull();
    return response.data as any;
  }

  async function deurVersion(id: string) {
    const result = await clients.operations.schema("erp").from("deurs").select("row_version").eq("id", id).single();
    expect(result.error).toBeNull();
    return result.data!.row_version as number;
  }

  async function statementVersion(id: string) {
    const result = await clients.finance.schema("erp").from("billing_statements").select("row_version").eq("id", id).single();
    expect(result.error).toBeNull();
    return result.data!.row_version as number;
  }

  beforeAll(async () => {
    assertSupabaseFixtureMutationAllowed(configuration, [tenant]);
    cleanup();
    for (const actor of Object.keys(ids) as Array<keyof typeof ids>) {
      const created = await harness!.admin.auth.admin.createUser({
        id: ids[actor], email: email(actor), password, email_confirm: true,
      });
      if (created.error) throw created.error;
    }
    owner(`
      BEGIN;
      INSERT INTO erp.companies(id,code,name,environment_class)
        VALUES('${tenant}','${tenant}','C4E Financial Recovery','test');
      INSERT INTO erp.operators(id,name,status,company_id)
        VALUES('UAT-C4E-OP','C4E Operator','Active','${tenant}');
      INSERT INTO erp.users(id,username,display_name,status,operator_id,company_id) VALUES
        ('${ids.operations}'::uuid,'${email("operations")}','C4E Operations','active','UAT-C4E-OP','${tenant}'),
        ('${ids.finance}'::uuid,'${email("finance")}','C4E Finance','active',NULL,'${tenant}');
      INSERT INTO erp.app_roles(id,code,name) VALUES
        ('ROLE-UAT-C4E-OPS','rental-operations-c4e','C4E Operations'),
        ('ROLE-UAT-C4E-FIN','finance-c4e','C4E Finance');
      INSERT INTO erp.app_permissions(id,code,name) VALUES
        ('PERM-UAT-C4E-DEUR-CREATE','deur.create','DEUR Create'),
        ('PERM-UAT-C4E-DEUR-REVIEW','deur.review','DEUR Review'),
        ('PERM-UAT-C4E-DEUR-CORRECT','deur.correct','DEUR Correct'),
        ('PERM-UAT-C4E-RENTAL-READ','rental.read','Rental Read'),
        ('PERM-UAT-C4E-ASG-READ','assignment.read','Assignment Read'),
        ('PERM-UAT-C4E-BILL-CREATE','billing.create','Billing Create'),
        ('PERM-UAT-C4E-BILL-UPDATE','billing.update','Billing Update'),
        ('PERM-UAT-C4E-BILL-READ','billing.read','Billing Read');
      INSERT INTO erp.role_permissions(role_id,permission_id)
        SELECT 'ROLE-UAT-C4E-OPS',id FROM erp.app_permissions
        WHERE id IN('PERM-UAT-C4E-DEUR-CREATE','PERM-UAT-C4E-DEUR-REVIEW','PERM-UAT-C4E-DEUR-CORRECT',
          'PERM-UAT-C4E-RENTAL-READ','PERM-UAT-C4E-ASG-READ');
      INSERT INTO erp.role_permissions(role_id,permission_id)
        SELECT 'ROLE-UAT-C4E-FIN',id FROM erp.app_permissions
        WHERE id IN('PERM-UAT-C4E-BILL-CREATE','PERM-UAT-C4E-BILL-UPDATE','PERM-UAT-C4E-BILL-READ',
          'PERM-UAT-C4E-DEUR-REVIEW');
      INSERT INTO erp.user_roles(user_id,role_id) VALUES
        ('${ids.operations}'::uuid,'ROLE-UAT-C4E-OPS'),('${ids.finance}'::uuid,'ROLE-UAT-C4E-FIN');
      INSERT INTO erp.customers(id,customer_code,name,email,company_id)
        VALUES('UAT-C4E-CUSTOMER','UAT-C4E-CUST','C4E Customer','customer-c4e@example.invalid','${tenant}');
      INSERT INTO erp.projects(id,project_code,name,customer_id,company_id)
        VALUES('UAT-C4E-PROJECT','UAT-C4E-PROJ','C4E Project','UAT-C4E-CUSTOMER','${tenant}');
      INSERT INTO erp.equipment(id,asset_no,equipment_name,maintenance_type,company_id)
        VALUES('UAT-C4E-EQ','UAT-C4E-EQ','C4E Equipment','None','${tenant}');
      INSERT INTO erp.assignments(id,equipment_id,operator_id,project_id,assigned_date,expected_return,status,company_id)
        VALUES('UAT-C4E-ASG','UAT-C4E-EQ','UAT-C4E-OP','UAT-C4E-PROJECT','2026-07-01','2026-08-29','Active','${tenant}');
      INSERT INTO erp.rentals(id,rental_number,customer_id,project_id,customer_snapshot,project_snapshot,date_out,rental_type,status,company_id)
        VALUES('UAT-C4E-RENTAL','UAT-C4E-RENTAL','UAT-C4E-CUSTOMER','UAT-C4E-PROJECT','C4E Customer','C4E Project',
          '2026-07-29','Operated Rental','Active','${tenant}');
      INSERT INTO erp.rental_equipment_lines(id,rental_id,equipment_id,assignment_id,operator_id,status,company_id)
        VALUES('UAT-C4E-LINE','UAT-C4E-RENTAL','UAT-C4E-EQ','UAT-C4E-ASG','UAT-C4E-OP','Active','${tenant}');
      INSERT INTO erp.commercial_snapshots(id,rental_id,rental_equipment_line_id,billing_method,unit_rate,
        minimum_billable_hours,standby_rate,mobilization_fee,demobilization_fee,fuel_charge,operator_included,
        operator_rate,tax_rate,withholding_tax,currency,captured_at)
        VALUES('UAT-C4E-SNAPSHOT','UAT-C4E-RENTAL','UAT-C4E-LINE','Per Hour',100,0,20,0,0,0,true,0,0,0,'PHP',now());
      INSERT INTO erp.deurs(id,deur_number,rental_id,rental_equipment_line_id,equipment_id,operator_id,project_id,
        customer_id,commercial_snapshot_id,work_date,status,evidence_mode,billing_method_snapshot,
        total_operating_minutes,total_idle_minutes,total_standby_minutes,opening_meter,closing_meter,submitted_at,company_id)
        VALUES('UAT-C4E-DEUR-ORIGINAL','UAT-C4E-DEUR-ORIGINAL','UAT-C4E-RENTAL','UAT-C4E-LINE','UAT-C4E-EQ',
          'UAT-C4E-OP','UAT-C4E-PROJECT','UAT-C4E-CUSTOMER','UAT-C4E-SNAPSHOT','2026-07-29','Submitted',
          'TIME_TIMELINE','Per Hour',60,0,30,100,110,now(),'${tenant}');
      COMMIT;
    `);
    for (const actor of Object.keys(ids) as Array<keyof typeof ids>) {
      clients[actor] = createClient(configuration.url!, configuration.publishableKey!, {
        auth: { persistSession: false, autoRefreshToken: false, storageKey: `c4e-${actor}` },
      });
      const login = await clients[actor].auth.signInWithPassword({ email: email(actor), password });
      if (login.error) throw login.error;
    }
  }, 60_000);

  afterAll(async () => {
    await Promise.allSettled(Object.values(clients).map((client) => client.auth.signOut()));
    cleanup();
    cleanup();
    await Promise.all(Object.values(ids).map((id) => harness!.admin.auth.admin.deleteUser(id)));
  }, 60_000);

  it("acknowledges the original submitted revision and preserves review evidence", async () => {
    const created = await rpc("operations", "command_create_customer_review_request", {
      commandId: "C4E-REVIEW-ORIGINAL", idempotencyKey: "C4E-REVIEW-ORIGINAL",
      rentalLineId: "UAT-C4E-LINE",
      deurId: "UAT-C4E-DEUR-ORIGINAL", revisionId: "UAT-C4E-DEUR-ORIGINAL",
    });
    expect(created).toMatchObject({ success: true, disposition: "ACCEPTED" });
    originalReviewToken = created.value.notification.reviewPath.slice("/review/deur/".length);
    expect(typeof originalReviewToken).toBe("string");
    const acknowledged = await publicRpc("public_acknowledge_customer_review", {
      commandId: "C4E-ACK-ORIGINAL", idempotencyKey: "C4E-ACK-ORIGINAL",
      token: originalReviewToken,
    });
    expect(acknowledged).toMatchObject({ success: true, value: { reviewStatus: "Acknowledged" } });
    const original = await clients.operations.schema("erp").from("deurs")
      .select("status,acknowledged_at,row_version").eq("id", "UAT-C4E-DEUR-ORIGINAL").single();
    expect(original.data?.status).toBe("Acknowledged");
    expect(original.data?.acknowledged_at).not.toBeNull();
  });

  it("creates, invoices, cancels, and releases the original immutable consumption", async () => {
    const statement = await rpc("finance", "command_create_billing_statement", {
      commandId: "C4E-BILL-OLD", idempotencyKey: "C4E-BILL-OLD", statementId: "UAT-C4E-BILL-OLD",
      rentalId: "UAT-C4E-RENTAL", billingFrom: "2026-07-29", billingTo: "2026-07-29", currency: "PHP",
    });
    expect(statement.success).toBe(true);
    const consumed = await rpc("finance", "command_consume_deur", {
      commandId: "C4E-CONSUME-OLD", idempotencyKey: "C4E-CONSUME-OLD", statementId: "UAT-C4E-BILL-OLD",
      deurId: "UAT-C4E-DEUR-ORIGINAL", lineId: "UAT-C4E-BILL-LINE-OLD",
      expectedVersion: await deurVersion("UAT-C4E-DEUR-ORIGINAL"),
    });
    expect(consumed.success).toBe(true);
    const finalized = await rpc("finance", "command_finalize_billing_statement", {
      commandId: "C4E-FINALIZE-OLD", idempotencyKey: "C4E-FINALIZE-OLD", statementId: "UAT-C4E-BILL-OLD",
      expectedVersion: await statementVersion("UAT-C4E-BILL-OLD"),
    });
    expect(finalized.success).toBe(true);
    const invoiced = await rpc("finance", "command_create_invoice", {
      commandId: "C4E-INVOICE-OLD", idempotencyKey: "C4E-INVOICE-OLD", statementId: "UAT-C4E-BILL-OLD",
      expectedVersion: await statementVersion("UAT-C4E-BILL-OLD"),
    });
    expect(invoiced.success).toBe(true);
    const cancelledCommand = {
      commandId: "C4E-CANCEL-INVOICE", idempotencyKey: "C4E-CANCEL-INVOICE", statementId: "UAT-C4E-BILL-OLD",
      expectedVersion: await statementVersion("UAT-C4E-BILL-OLD"),
      reason: "Corrected DEUR requires invoice cancellation.",
    };
    const cancelled = await rpc("finance", "command_cancel_invoice", cancelledCommand);
    expect(cancelled).toMatchObject({ success: true, disposition: "ACCEPTED" });
    const replay = await rpc("finance", "command_cancel_invoice", { ...cancelledCommand, commandId: "C4E-CANCEL-INVOICE-REPLAY" });
    expect(replay).toMatchObject({ success: true, disposition: "REPLAYED" });
    const duplicate = await rpc("finance", "command_cancel_invoice", {
      ...cancelledCommand, commandId: "C4E-CANCEL-INVOICE-DUP", idempotencyKey: "C4E-CANCEL-INVOICE-DUP",
      expectedVersion: await statementVersion("UAT-C4E-BILL-OLD"),
    });
    expect(duplicate).toMatchObject({ success: false, code: "ALREADY_REVERSED" });
    const releaseCommand = {
      commandId: "C4E-RELEASE-CONSUMPTION", idempotencyKey: "C4E-RELEASE-CONSUMPTION",
      statementId: "UAT-C4E-BILL-OLD", deurId: "UAT-C4E-DEUR-ORIGINAL",
      expectedVersion: await deurVersion("UAT-C4E-DEUR-ORIGINAL"),
      reason: "Release consumption for corrected DEUR rebilling.",
    };
    const released = await rpc("finance", "command_release_deur_consumption", releaseCommand);
    expect(released).toMatchObject({ success: true, disposition: "ACCEPTED" });
    const releasedReplay = await rpc("finance", "command_release_deur_consumption", {
      ...releaseCommand, commandId: "C4E-RELEASE-CONSUMPTION-REPLAY",
    });
    expect(releasedReplay).toMatchObject({ success: true, disposition: "REPLAYED" });
  });

  it("creates and applies a validated correction revision", async () => {
    const missingReason = await rpc("operations", "command_create_deur_correction", {
      commandId: "C4E-CORRECTION-NO-REASON", idempotencyKey: "C4E-CORRECTION-NO-REASON",
      sourceRevisionId: "UAT-C4E-DEUR-ORIGINAL", expectedVersion: await deurVersion("UAT-C4E-DEUR-ORIGINAL"),
    });
    expect(missingReason).toMatchObject({ success: false, code: "VALIDATION_REJECTED" });
    const command = {
      commandId: "C4E-CORRECTION-CREATE", idempotencyKey: "C4E-CORRECTION-CREATE",
      sourceRevisionId: "UAT-C4E-DEUR-ORIGINAL", expectedVersion: await deurVersion("UAT-C4E-DEUR-ORIGINAL"),
      reasonCode: "INCORRECT_TIME_ENTRY", reasonDetails: "Signed evidence requires corrected time allocation.",
    };
    const created = await rpc("operations", "command_create_deur_correction", command);
    expect(created).toMatchObject({ success: true, disposition: "ACCEPTED" });
    revisionId = created.value.revisionId;
    const replay = await rpc("operations", "command_create_deur_correction", {
      ...command, commandId: "C4E-CORRECTION-CREATE-REPLAY",
    });
    expect(replay).toMatchObject({ success: true, disposition: "REPLAYED" });
    const invalidPatchBase = {
      revisionId, expectedVersion: await deurVersion(revisionId),
      patch: { reason: "Invalid correction validation." },
    };
    const nonAllowlisted = await rpc("operations", "command_apply_deur_correction", {
      ...invalidPatchBase, commandId: "C4E-PATCH-NONALLOW", idempotencyKey: "C4E-PATCH-NONALLOW",
      patch: { ...invalidPatchBase.patch, status: "Acknowledged" },
    });
    expect(nonAllowlisted).toMatchObject({ success: false, code: "VALIDATION_REJECTED" });
    const events = [
      { sequence: 1, activityType: "shift", action: "start", timestamp: "2026-07-29T08:00:00Z" },
      { sequence: 2, activityType: "operation", action: "start", timestamp: "2026-07-29T08:00:00Z" },
      { sequence: 3, activityType: "operation", action: "end", timestamp: "2026-07-29T09:30:00Z" },
      { sequence: 4, activityType: "standby", action: "start", timestamp: "2026-07-29T09:30:00Z" },
      { sequence: 5, activityType: "standby", action: "end", timestamp: "2026-07-29T10:00:00Z" },
      { sequence: 6, activityType: "idle", action: "start", timestamp: "2026-07-29T10:00:00Z" },
      { sequence: 7, activityType: "idle", action: "end", timestamp: "2026-07-29T10:30:00Z" },
      { sequence: 8, activityType: "shift", action: "end", timestamp: "2026-07-29T10:30:00Z" },
    ];
    for (const [label, patch] of [
      ["SEQUENCE", { events: events.map((event, index) => ({ ...event, sequence: index === 2 ? 4 : event.sequence })),
        reason: "Reject non-contiguous events." }],
      ["CHRONOLOGY", { events: events.map((event, index) => ({ ...event,
        timestamp: index === 4 ? "2026-07-29T09:00:00Z" : event.timestamp })), reason: "Reject chronology." }],
      ["METER", { events, openingMeter: 120, closingMeter: 110, reason: "Reject meter rollback." }],
      ["PROJECT", { events, projectId: "UAT-C4E-CROSS-TENANT", reason: "Reject invalid project." }],
    ] as const) {
      const rejected = await rpc("operations", "command_apply_deur_correction", {
        commandId: `C4E-PATCH-${label}`, idempotencyKey: `C4E-PATCH-${label}`,
        revisionId, expectedVersion: await deurVersion(revisionId), patch,
      });
      expect(rejected).toMatchObject({ success: false, code: "VALIDATION_REJECTED" });
    }
    const appliedCommand = {
      commandId: "C4E-PATCH-VALID", idempotencyKey: "C4E-PATCH-VALID",
      revisionId, expectedVersion: await deurVersion(revisionId),
      patch: { events, openingMeter: 100, closingMeter: 118, projectId: "UAT-C4E-PROJECT",
        reason: "Corrected against immutable signed evidence." },
    };
    const applied = await rpc("operations", "command_apply_deur_correction", appliedCommand);
    expect(applied).toMatchObject({ success: true, disposition: "ACCEPTED",
      value: { operationMinutes: 90, standbyMinutes: 30, idleMinutes: 30 } });
    const mismatch = await rpc("operations", "command_apply_deur_correction", {
      ...appliedCommand, commandId: "C4E-PATCH-MISMATCH",
      expectedVersion: await deurVersion(revisionId),
      patch: { ...appliedCommand.patch, closingMeter: 119 },
    });
    expect(mismatch).toMatchObject({ success: false, code: "IDEMPOTENCY_MISMATCH" });
  });

  it("resubmits and acknowledges only the corrected effective revision", async () => {
    const identity = {
      rentalId: "UAT-C4E-RENTAL", rentalLineId: "UAT-C4E-LINE", assignmentId: "UAT-C4E-ASG",
      equipmentId: "UAT-C4E-EQ", operatorId: "UAT-C4E-OP", deurId: revisionId,
    };
    const submitted = await rpc("operations", "command_submit_deur", {
      ...identity, commandId: "C4E-SUBMIT-CORRECTED", idempotencyKey: "C4E-SUBMIT-CORRECTED",
      expectedVersion: await deurVersion(revisionId),
    });
    expect(submitted).toMatchObject({ success: true, disposition: "ACCEPTED" });
    const staleOriginal = await publicRpc("public_acknowledge_customer_review", {
      commandId: "C4E-ACK-ORIGINAL-AGAIN", idempotencyKey: "C4E-ACK-ORIGINAL-AGAIN",
      token: originalReviewToken,
    });
    expect(staleOriginal).toMatchObject({ success: false, code: "ALREADY_COMPLETED" });
    const created = await rpc("operations", "command_create_customer_review_request", {
      commandId: "C4E-REVIEW-CORRECTED", idempotencyKey: "C4E-REVIEW-CORRECTED",
      deurId: revisionId, rentalLineId: "UAT-C4E-LINE", revisionId,
    });
    expect(created.success).toBe(true);
    correctedReviewToken = created.value.notification.reviewPath.slice("/review/deur/".length);
    const acknowledged = await publicRpc("public_acknowledge_customer_review", {
      commandId: "C4E-ACK-CORRECTED", idempotencyKey: "C4E-ACK-CORRECTED",
      token: correctedReviewToken,
    });
    expect(acknowledged).toMatchObject({ success: true, value: { reviewStatus: "Acknowledged" } });
  });

  it("rebills corrected totals while retaining immutable financial history", async () => {
    const created = await rpc("finance", "command_create_billing_statement", {
      commandId: "C4E-BILL-NEW", idempotencyKey: "C4E-BILL-NEW", statementId: "UAT-C4E-BILL-NEW",
      rentalId: "UAT-C4E-RENTAL", billingFrom: "2026-07-29", billingTo: "2026-07-29", currency: "PHP",
    });
    expect(created.success).toBe(true);
    const oldBlocked = await rpc("finance", "command_consume_deur", {
      commandId: "C4E-CONSUME-SUPERSEDED", idempotencyKey: "C4E-CONSUME-SUPERSEDED",
      statementId: "UAT-C4E-BILL-NEW", deurId: "UAT-C4E-DEUR-ORIGINAL",
      lineId: "UAT-C4E-BILL-LINE-SUPERSEDED", expectedVersion: await deurVersion("UAT-C4E-DEUR-ORIGINAL"),
    });
    expect(oldBlocked).toMatchObject({ success: false, code: "BILLING_INELIGIBLE" });
    const consumedCommand = {
      commandId: "C4E-CONSUME-NEW", idempotencyKey: "C4E-CONSUME-NEW",
      statementId: "UAT-C4E-BILL-NEW", deurId: revisionId, lineId: "UAT-C4E-BILL-LINE-NEW",
      expectedVersion: await deurVersion(revisionId),
    };
    const consumed = await rpc("finance", "command_consume_deur", consumedCommand);
    expect(consumed).toMatchObject({ success: true, disposition: "ACCEPTED" });
    const replay = await rpc("finance", "command_consume_deur", {
      ...consumedCommand, commandId: "C4E-CONSUME-NEW-REPLAY",
    });
    expect(replay).toMatchObject({ success: true, disposition: "REPLAYED" });
    const duplicate = await rpc("finance", "command_consume_deur", {
      ...consumedCommand, commandId: "C4E-CONSUME-NEW-DUP", idempotencyKey: "C4E-CONSUME-NEW-DUP",
      lineId: "UAT-C4E-BILL-LINE-NEW-DUP", expectedVersion: await deurVersion(revisionId),
    });
    expect(duplicate.success).toBe(false);
    const finalized = await rpc("finance", "command_finalize_billing_statement", {
      commandId: "C4E-FINALIZE-NEW", idempotencyKey: "C4E-FINALIZE-NEW", statementId: "UAT-C4E-BILL-NEW",
      expectedVersion: await statementVersion("UAT-C4E-BILL-NEW"),
    });
    expect(finalized.success).toBe(true);
    const invoiced = await rpc("finance", "command_create_invoice", {
      commandId: "C4E-INVOICE-NEW", idempotencyKey: "C4E-INVOICE-NEW", statementId: "UAT-C4E-BILL-NEW",
      expectedVersion: await statementVersion("UAT-C4E-BILL-NEW"),
    });
    expect(invoiced.success).toBe(true);
    const evidence = owner(`
      SELECT jsonb_build_object(
        'oldLine',(SELECT jsonb_build_object('amount',amount,'grandTotal',grand_total,'released',consumption_released_at IS NOT NULL)
          FROM erp.billing_statement_lines WHERE id='UAT-C4E-BILL-LINE-OLD'),
        'newLine',(SELECT jsonb_build_object('amount',amount,'grandTotal',grand_total,'released',consumption_released_at IS NOT NULL)
          FROM erp.billing_statement_lines WHERE id='UAT-C4E-BILL-LINE-NEW'),
        'activeConsumptions',(SELECT count(*) FROM erp.billing_statement_lines
          WHERE company_id='${tenant}' AND consumption_released_at IS NULL),
        'recoveries',(SELECT count(*) FROM erp.recovery_compensations WHERE company_id='${tenant}'),
        'audits',(SELECT count(*) FROM erp.audit_log WHERE company_id='${tenant}'),
        'commands',(SELECT count(*) FROM erp.operational_command_idempotency WHERE company_id='${tenant}'),
        'orphanLines',(SELECT count(*) FROM erp.billing_statement_lines l LEFT JOIN erp.billing_statements s
          ON s.id=l.billing_statement_id WHERE l.company_id='${tenant}' AND s.id IS NULL)
      ) AS c4e_evidence;
    `);
    expect(evidence).toContain('"activeConsumptions": 1');
    expect(evidence).toContain('"recoveries": 2');
    expect(evidence).toContain('"orphanLines": 0');
    expect(evidence).toContain('"released": true');
    expect(evidence).toContain('"amount": 110');
    expect(evidence).toContain('"amount": 160');
  });

  it("keeps raw review tokens out of persistent command and audit evidence", () => {
    const evidence = owner(`
      SELECT jsonb_build_object(
        'rawTokenInCommands',EXISTS(SELECT 1 FROM erp.operational_command_idempotency
          WHERE company_id='${tenant}' AND safe_response::text LIKE '%rawToken%'),
        'rawTokenValueInCommands',EXISTS(SELECT 1 FROM erp.operational_command_idempotency
          WHERE company_id='${tenant}' AND safe_response::text LIKE '%'||'${originalReviewToken}'||'%'),
        'rawTokenValueInAudit',EXISTS(SELECT 1 FROM erp.audit_log
          WHERE company_id='${tenant}' AND coalesce(new_values::text,'') LIKE '%'||'${correctedReviewToken}'||'%')
      ) AS token_evidence;
    `);
    expect(evidence).toContain('"rawTokenInCommands": false');
    expect(evidence).toContain('"rawTokenValueInCommands": false');
    expect(evidence).toContain('"rawTokenValueInAudit": false');
  });
});
