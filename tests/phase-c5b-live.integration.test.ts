import { randomBytes, randomUUID } from "node:crypto";
import { spawn, type ChildProcess } from "node:child_process";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { chromium, expect as playwrightExpect, type Browser } from "@playwright/test";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  assertSupabaseFixtureMutationAllowed,
  createSupabasePhaseC2Harness,
  readSupabasePhaseC2TestConfiguration,
} from "./support/supabasePhaseC2Harness";
import { executePhaseC4bPrivilegedSql } from "./support/phaseC4bPrivilegedSql";
import { executeParallelCommandRace } from "./support/parallelCommandRace";
import { ResendEmailDeliveryProvider } from "../server/notifications/ResendEmailDeliveryProvider";
import { parseNotificationServerConfiguration } from "../server/notifications/config";
import { renderNotificationTemplate } from "@/features/notifications/templates";

const configuration = readSupabasePhaseC2TestConfiguration();
const enabled = configuration.enabled && process.env.RUN_PHASE_C5B_LIVE === "true";
const tenant = "TENANT-UAT-C5B-CERT";
const tenantB = "TENANT-UAT-C5B-TENANT-B-CERT";
const actorId = "7c5b0000-0000-4000-8000-000000000001";
const deniedId = "7c5b0000-0000-4000-8000-000000000002";
const actorBId = "7c5b0000-0000-4000-8000-000000000003";
const actorEmail = "tenant-uat-c5b-manager@example.invalid";
const deniedEmail = "tenant-uat-c5b-denied@example.invalid";
const actorBEmail = "tenant-uat-c5b-tenant-b@example.invalid";
const password = `C5B-${randomBytes(24).toString("base64url")}`;
const deurIds = Array.from({ length: 31 }, (_, index) => `UAT-C5B-DEUR-${index + 1}`);

describe.skipIf(!enabled)("Phase C5B manager review live certification", () => {
  const harness = enabled ? createSupabasePhaseC2Harness(configuration) : undefined;
  let manager: SupabaseClient;
  let denied: SupabaseClient;
  let anonymousA: SupabaseClient;
  let anonymousB: SupabaseClient;
  let managerB: SupabaseClient;

  const owner = (sql: string) => executePhaseC4bPrivilegedSql(configuration, { tenantIds: [tenant, tenantB], sql });
  const ownerValue = (sql: string): any => {
    const output = JSON.parse(owner(sql));
    return output.rows[0].jsonb_build_object;
  };
  const cleanup = () => owner(`
    BEGIN;
    SET LOCAL session_replication_role='replica';
    DELETE FROM erp.notification_delivery_attempts WHERE company_id IN('${tenant}','${tenantB}');
    DELETE FROM erp.notification_outbox WHERE company_id IN('${tenant}','${tenantB}');
    WITH deleted AS (DELETE FROM erp.manager_review_outcomes WHERE company_id='${tenant}' RETURNING 1)
      SELECT count(*) FROM deleted;
    DELETE FROM erp.manager_correction_requests WHERE company_id='${tenant}';
    DELETE FROM erp.manager_review_requests WHERE company_id='${tenant}';
    DELETE FROM erp.customer_review_outcomes WHERE company_id='${tenant}';
    DELETE FROM erp.customer_correction_requests WHERE company_id='${tenant}';
    DELETE FROM erp.customer_review_requests WHERE company_id='${tenant}';
    DELETE FROM erp.deur_review_history WHERE company_id='${tenant}';
    DELETE FROM erp.deur_events WHERE company_id='${tenant}';
    DELETE FROM erp.deur_command_idempotency WHERE company_id='${tenant}';
    DELETE FROM erp.operational_command_idempotency WHERE company_id='${tenant}';
    DELETE FROM erp.audit_log WHERE company_id='${tenant}';
    DELETE FROM erp.deurs WHERE company_id='${tenant}';
    DELETE FROM erp.rental_equipment_lines WHERE company_id='${tenant}';
    DELETE FROM erp.rentals WHERE company_id='${tenant}';
    DELETE FROM erp.assignments WHERE company_id='${tenant}';
    DELETE FROM erp.equipment WHERE company_id='${tenant}';
    DELETE FROM erp.operators WHERE company_id='${tenant}';
    DELETE FROM erp.projects WHERE company_id='${tenant}';
    DELETE FROM erp.customers WHERE company_id='${tenant}';
    DELETE FROM erp.user_roles WHERE user_id IN('${actorId}'::uuid,'${deniedId}'::uuid,'${actorBId}'::uuid);
    DELETE FROM erp.users WHERE company_id IN('${tenant}','${tenantB}');
    DELETE FROM erp.role_permissions WHERE role_id='ROLE-UAT-C5B-MANAGER';
    DELETE FROM erp.app_roles WHERE id='ROLE-UAT-C5B-MANAGER';
    DELETE FROM erp.app_permissions WHERE id IN(
      'PERM-UAT-C5B-APPROVE','PERM-UAT-C5B-CORRECT','PERM-UAT-C5B-REVIEW'
    );
    DELETE FROM erp.deur_events WHERE company_id='${tenantB}';
    DELETE FROM erp.operational_command_idempotency WHERE company_id='${tenantB}';
    DELETE FROM erp.audit_log WHERE company_id='${tenantB}';
    DELETE FROM erp.customer_review_requests WHERE company_id='${tenantB}';
    DELETE FROM erp.manager_review_requests WHERE company_id='${tenantB}';
    DELETE FROM erp.deurs WHERE company_id='${tenantB}';
    DELETE FROM erp.rental_equipment_lines WHERE company_id='${tenantB}';
    DELETE FROM erp.rentals WHERE company_id='${tenantB}';
    DELETE FROM erp.assignments WHERE company_id='${tenantB}';
    DELETE FROM erp.equipment WHERE company_id='${tenantB}';
    DELETE FROM erp.operators WHERE company_id='${tenantB}';
    DELETE FROM erp.projects WHERE company_id='${tenantB}';
    DELETE FROM erp.customers WHERE company_id='${tenantB}';
    DELETE FROM erp.companies WHERE id IN('${tenant}','${tenantB}');
    COMMIT;
  `);

  const rpc = async (client: SupabaseClient, name: string, command: Record<string, unknown>) => {
    const result = await client.schema("erp").rpc(name, { command });
    expect(result.error, `${name}: ${result.error?.code ?? ""} ${result.error?.message ?? ""}`).toBeNull();
    return result.data as any;
  };

  const issue = async (deurId: string, key = `ISSUE-${deurId}`) => {
    const result = await rpc(manager, "command_create_manager_review_request", {
      commandId: `${key}-${randomUUID()}`, idempotencyKey: key, deurId,
      rentalLineId: "UAT-C5B-LINE", revisionId: deurId, recipientUserId: actorId,
    });
    expect(result).toMatchObject({ success: true });
    const path = result.value.notification.reviewPath as string;
    expect(path).toMatch(/^\/review\/manager\/[0-9a-f]{64}$/);
    return path.slice("/review/manager/".length);
  };

  const command = (key: string, token: string, reason?: string) => ({
    token, commandId: `${key}-${randomUUID()}`, idempotencyKey: key,
    ...(reason === undefined ? {} : { reason }),
  });

  beforeAll(async () => {
    assertSupabaseFixtureMutationAllowed(configuration, [tenant]);
    cleanup();
    for (const identity of [
      { id: actorId, email: actorEmail },
      { id: deniedId, email: deniedEmail },
      { id: actorBId, email: actorBEmail },
    ]) {
      const created = await harness!.admin.auth.admin.createUser({
        ...identity, password, email_confirm: true,
      });
      if (created.error) throw created.error;
    }
    owner(`
      BEGIN;
      INSERT INTO erp.companies(id,code,name,environment_class)
        VALUES('${tenant}','${tenant}','C5B Certification','test');
      INSERT INTO erp.companies(id,code,name,environment_class)
        VALUES('${tenantB}','${tenantB}','C5B Tenant B','test');
      INSERT INTO erp.operators(id,name,status,company_id)
        VALUES('UAT-C5B-OP','C5B Operator','Active','${tenant}');
      INSERT INTO erp.users(id,username,display_name,status,operator_id,company_id) VALUES
        ('${actorId}'::uuid,'${actorEmail}','C5B Manager','active','UAT-C5B-OP','${tenant}'),
        ('${deniedId}'::uuid,'${deniedEmail}','C5B Denied','active',NULL,'${tenant}');
      INSERT INTO erp.operators(id,name,status,company_id)
        VALUES('UAT-C5B-B-OP','Tenant B Operator','Active','${tenantB}');
      INSERT INTO erp.users(id,username,display_name,status,operator_id,company_id)
        VALUES('${actorBId}'::uuid,'${actorBEmail}','Tenant B Manager','active','UAT-C5B-B-OP','${tenantB}');
      INSERT INTO erp.app_roles(id,code,name)
        VALUES('ROLE-UAT-C5B-MANAGER','manager-c5b','C5B Manager');
      INSERT INTO erp.app_permissions(id,code,name) VALUES
        ('PERM-UAT-C5B-APPROVE','rental.approve','Rental Approve'),
        ('PERM-UAT-C5B-CORRECT','deur.correct','DEUR Correct'),
        ('PERM-UAT-C5B-REVIEW','deur.review','DEUR Review');
      INSERT INTO erp.role_permissions(role_id,permission_id) VALUES
        ('ROLE-UAT-C5B-MANAGER','PERM-UAT-C5B-APPROVE'),
        ('ROLE-UAT-C5B-MANAGER','PERM-UAT-C5B-CORRECT'),
        ('ROLE-UAT-C5B-MANAGER','PERM-UAT-C5B-REVIEW');
      INSERT INTO erp.user_roles(user_id,role_id)
        VALUES('${actorId}'::uuid,'ROLE-UAT-C5B-MANAGER');
      INSERT INTO erp.user_roles(user_id,role_id)
        VALUES('${actorBId}'::uuid,'ROLE-UAT-C5B-MANAGER');
      INSERT INTO erp.customers(id,customer_code,name,email,company_id)
        VALUES('UAT-C5B-CUSTOMER','UAT-C5B-CUST','C5B Customer','customer-c5b@example.invalid','${tenant}');
      INSERT INTO erp.projects(id,project_code,name,customer_id,company_id)
        VALUES('UAT-C5B-PROJECT','UAT-C5B-PROJ','C5B Project','UAT-C5B-CUSTOMER','${tenant}');
      INSERT INTO erp.equipment(id,asset_no,equipment_name,maintenance_type,company_id)
        VALUES('UAT-C5B-EQ','UAT-C5B-EQ','C5B Excavator','None','${tenant}');
      INSERT INTO erp.assignments(id,equipment_id,operator_id,project_id,assigned_date,expected_return,status,company_id)
        VALUES('UAT-C5B-ASG','UAT-C5B-EQ','UAT-C5B-OP','UAT-C5B-PROJECT','2026-07-01','2026-12-31','Active','${tenant}');
      INSERT INTO erp.rentals(id,rental_number,customer_id,project_id,customer_snapshot,project_snapshot,date_out,status,company_id)
        VALUES('UAT-C5B-RENTAL','UAT-C5B-RENTAL','UAT-C5B-CUSTOMER','UAT-C5B-PROJECT','C5B Customer','C5B Project','2026-07-01','Active','${tenant}');
      INSERT INTO erp.rental_equipment_lines(id,rental_id,equipment_id,assignment_id,operator_id,status,company_id)
        VALUES('UAT-C5B-LINE','UAT-C5B-RENTAL','UAT-C5B-EQ','UAT-C5B-ASG','UAT-C5B-OP','Active','${tenant}');
      ${deurIds.map((id, index) => `
        INSERT INTO erp.deurs(
          id,deur_number,rental_id,rental_equipment_line_id,equipment_id,operator_id,
          project_id,customer_id,work_date,shift,status,evidence_mode,total_operating_minutes,
          total_idle_minutes,total_standby_minutes,opening_meter,closing_meter,submitted_at,
          revision_chain_id,revision_number,original_deur_id,company_id
        ) VALUES('${id}','DEUR-C5B-${index + 1}','UAT-C5B-RENTAL','UAT-C5B-LINE','UAT-C5B-EQ','UAT-C5B-OP',
          'UAT-C5B-PROJECT','UAT-C5B-CUSTOMER','2026-08-${String(index + 1).padStart(2, "0")}',
          'Day','Submitted','TIME_TIMELINE',360,30,30,100,110,now(),'${id}',1,'${id}','${tenant}');
        INSERT INTO erp.deur_events(id,deur_id,activity_type,action,occurred_at,sequence,source,actor_id,is_open,company_id) VALUES
          ('${id}-E1','${id}','shift','start',now()-interval '7 hours',1,'operator','${actorId}',false,'${tenant}'),
          ('${id}-E2','${id}','operation','start',now()-interval '7 hours',2,'operator','${actorId}',false,'${tenant}'),
          ('${id}-E3','${id}','operation','end',now()-interval '1 hour',3,'operator','${actorId}',false,'${tenant}'),
          ('${id}-E4','${id}','shift','end',now()-interval '1 hour',4,'operator','${actorId}',false,'${tenant}');
      `).join("\n")}
      INSERT INTO erp.customers(id,customer_code,name,email,company_id)
        VALUES('UAT-C5B-B-CUSTOMER','UAT-C5B-B-CUST','Tenant B Customer','customer-c5b-b@example.invalid','${tenantB}');
      INSERT INTO erp.projects(id,project_code,name,customer_id,company_id)
        VALUES('UAT-C5B-B-PROJECT','UAT-C5B-B-PROJ','Tenant B Project','UAT-C5B-B-CUSTOMER','${tenantB}');
      INSERT INTO erp.equipment(id,asset_no,equipment_name,maintenance_type,company_id)
        VALUES('UAT-C5B-B-EQ','UAT-C5B-B-EQ','Tenant B Excavator','None','${tenantB}');
      INSERT INTO erp.assignments(id,equipment_id,operator_id,project_id,assigned_date,expected_return,status,company_id)
        VALUES('UAT-C5B-B-ASG','UAT-C5B-B-EQ','UAT-C5B-B-OP','UAT-C5B-B-PROJECT','2026-07-01','2026-12-31','Active','${tenantB}');
      INSERT INTO erp.rentals(id,rental_number,customer_id,project_id,customer_snapshot,project_snapshot,date_out,status,company_id)
        VALUES('UAT-C5B-B-RENTAL','RENTAL-B','UAT-C5B-B-CUSTOMER','UAT-C5B-B-PROJECT','Tenant B Customer','Tenant B Project','2026-07-01','Active','${tenantB}');
      INSERT INTO erp.rental_equipment_lines(id,rental_id,equipment_id,assignment_id,operator_id,status,company_id)
        VALUES('UAT-C5B-B-LINE','UAT-C5B-B-RENTAL','UAT-C5B-B-EQ','UAT-C5B-B-ASG','UAT-C5B-B-OP','Active','${tenantB}');
      INSERT INTO erp.deurs(
        id,deur_number,rental_id,rental_equipment_line_id,equipment_id,operator_id,project_id,customer_id,
        work_date,shift,status,evidence_mode,total_operating_minutes,total_idle_minutes,total_standby_minutes,
        opening_meter,closing_meter,submitted_at,revision_chain_id,revision_number,original_deur_id,company_id
      ) VALUES('UAT-C5B-B-DEUR','DEUR-B-1','UAT-C5B-B-RENTAL','UAT-C5B-B-LINE','UAT-C5B-B-EQ',
        'UAT-C5B-B-OP','UAT-C5B-B-PROJECT','UAT-C5B-B-CUSTOMER','2026-08-01','Day','Submitted',
        'TIME_TIMELINE',360,30,30,100,110,now(),'UAT-C5B-B-DEUR',1,'UAT-C5B-B-DEUR','${tenantB}');
      COMMIT;
    `);
    const options = (storageKey: string) => ({
      auth: { persistSession: false, autoRefreshToken: false, storageKey },
    });
    manager = createClient(configuration.url!, configuration.publishableKey!, options("c5b-manager"));
    denied = createClient(configuration.url!, configuration.publishableKey!, options("c5b-denied"));
    anonymousA = createClient(configuration.url!, configuration.publishableKey!, options("c5b-anon-a"));
    anonymousB = createClient(configuration.url!, configuration.publishableKey!, options("c5b-anon-b"));
    managerB = createClient(configuration.url!, configuration.publishableKey!, options("c5b-manager-b"));
    expect((await manager.auth.signInWithPassword({ email: actorEmail, password })).error).toBeNull();
    expect((await denied.auth.signInWithPassword({ email: deniedEmail, password })).error).toBeNull();
    expect((await managerB.auth.signInWithPassword({ email: actorBEmail, password })).error).toBeNull();
  }, 90_000);

  afterAll(async () => {
    await manager?.auth.signOut();
    await denied?.auth.signOut();
    await managerB?.auth.signOut();
    cleanup();
    cleanup();
    await harness!.admin.auth.admin.deleteUser(actorId);
    await harness!.admin.auth.admin.deleteUser(deniedId);
    await harness!.admin.auth.admin.deleteUser(actorBId);
  }, 90_000);

  it("issues a bound hash-only request and enforces the internal permission", async () => {
    const token = await issue(deurIds[0], "C5B-ISSUE");
    const replay = await rpc(manager, "command_create_manager_review_request", {
      commandId: randomUUID(), idempotencyKey: "C5B-ISSUE", deurId: deurIds[0],
      rentalLineId: "UAT-C5B-LINE", revisionId: deurIds[0], recipientUserId: actorId,
    });
    expect(replay.disposition).toBe("REPLAYED");
    expect(await rpc(denied, "command_create_manager_review_request", {
      commandId: randomUUID(), idempotencyKey: "DENIED", deurId: deurIds[1],
      rentalLineId: "UAT-C5B-LINE", revisionId: deurIds[1], recipientUserId: actorId,
    })).toMatchObject({ success: false, code: "FORBIDDEN" });
    const evidence = owner(`
      SELECT jsonb_build_object(
        'requests',(SELECT count(*) FROM erp.manager_review_requests WHERE company_id='${tenant}' AND revision_id='${deurIds[0]}'),
        'actions',(SELECT permitted_actions FROM erp.manager_review_requests WHERE company_id='${tenant}' AND revision_id='${deurIds[0]}'),
        'rawPersisted',EXISTS(
          SELECT 1 FROM erp.manager_review_requests WHERE company_id='${tenant}' AND to_jsonb(manager_review_requests)::text LIKE '%${token}%'
          UNION ALL SELECT 1 FROM erp.audit_log WHERE company_id='${tenant}' AND to_jsonb(audit_log)::text LIKE '%${token}%'
          UNION ALL SELECT 1 FROM erp.operational_command_idempotency WHERE company_id='${tenant}' AND to_jsonb(operational_command_idempotency)::text LIKE '%${token}%'
        )
      );
    `);
    expect(evidence).toContain('"requests": 1');
    expect(evidence).toContain('APPROVE');
    expect(evidence).toContain('"rawPersisted": false');
  });

  it("returns a safe snapshot and completes approve, reject, and correction lifecycles", async () => {
    const approvedToken = await issue(deurIds[1]);
    const snapshot = await rpc(anonymousA, "get_manager_review", { token: approvedToken });
    expect(snapshot).toMatchObject({ success: true, disposition: "AVAILABLE", value: {
      rentalReference: "UAT-C5B-RENTAL",
      availableActions: ["APPROVE", "REJECT", "REQUEST_CORRECTION"],
    } });
    expect(JSON.stringify(snapshot.value)).not.toMatch(/deurId|requestId|token|hash|companyId/i);
    const approve = command("APPROVE-1", approvedToken);
    expect(await rpc(anonymousA, "approve_manager_review", approve))
      .toMatchObject({ success: true, disposition: "ACCEPTED", value: { reviewStatus: "Approved" } });
    expect(await rpc(anonymousB, "approve_manager_review", { ...approve, commandId: randomUUID() }))
      .toMatchObject({ success: true, disposition: "REPLAYED" });
    expect(await rpc(anonymousB, "reject_manager_review", command("LATE-REJECT", approvedToken, "Cannot replace approval.")))
      .toMatchObject({ success: false, code: "ALREADY_COMPLETED" });

    const rejectedToken = await issue(deurIds[2]);
    expect(await rpc(anonymousA, "reject_manager_review", command("SHORT", rejectedToken, "short")))
      .toMatchObject({ success: false, code: "VALIDATION_REJECTED" });
    const markup = "  <script>alert('inert')</script> incorrect duration.  ";
    expect(await rpc(anonymousA, "reject_manager_review", command("REJECT-1", rejectedToken, markup)))
      .toMatchObject({ success: true, value: { reviewStatus: "Rejected" } });

    const correctionToken = await issue(deurIds[3]);
    expect(await rpc(anonymousA, "request_manager_correction",
      command("CORRECTION-1", correctionToken, "Incorrect operating duration.")))
      .toMatchObject({ success: true, value: { reviewStatus: "CorrectionRequested" } });
    const source = await manager.schema("erp").from("deurs").select("row_version").eq("id", deurIds[3]).single();
    const corrected = await rpc(manager, "command_create_deur_correction", {
      commandId: randomUUID(), idempotencyKey: "C5B-R2", sourceRevisionId: deurIds[3],
      expectedVersion: source.data!.row_version, reasonCode: "CUSTOMER_REQUESTED_CORRECTION",
      reasonDetails: "Incorrect operating duration.",
    });
    expect(corrected).toMatchObject({ success: true });
    const linkage = owner(`
      SELECT jsonb_build_object('status',status,'resultingRevisionId',resulting_revision_id)
      FROM erp.manager_correction_requests WHERE company_id='${tenant}' AND source_revision_id='${deurIds[3]}';
    `);
    expect(linkage).toContain('"status": "Resolved"');
    expect(linkage).toContain(corrected.value.revisionId);
  }, 30_000);

  it("enforces expiry, revocation, supersession, payload allowlists, and customer/manager separation", async () => {
    const expired = await issue(deurIds[4]);
    const revoked = await issue(deurIds[5]);
    const superseded = await issue(deurIds[6]);
    owner(`
      UPDATE erp.manager_review_requests SET expires_at=clock_timestamp()-interval '1 second'
        WHERE company_id='${tenant}' AND revision_id='${deurIds[4]}';
      UPDATE erp.manager_review_requests SET status='Revoked',revoked_at=clock_timestamp()
        WHERE company_id='${tenant}' AND revision_id='${deurIds[5]}';
      UPDATE erp.manager_review_requests SET status='Superseded',superseded_at=clock_timestamp(),revoked_at=clock_timestamp()
        WHERE company_id='${tenant}' AND revision_id='${deurIds[6]}';
    `);
    expect(await rpc(anonymousA, "approve_manager_review", command("EXPIRED", expired)))
      .toMatchObject({ success: false, code: "EXPIRED" });
    expect(await rpc(anonymousA, "reject_manager_review", command("REVOKED", revoked, "Valid rejected reason.")))
      .toMatchObject({ success: false, code: "INVALID_OR_UNAVAILABLE" });
    expect(await rpc(anonymousA, "request_manager_correction", command("SUPERSEDED", superseded, "Valid correction reason.")))
      .toMatchObject({ success: false, code: "SUPERSEDED" });
    expect(await rpc(anonymousA, "get_manager_review", { token: expired, companyId: tenant }))
      .toMatchObject({ success: false, code: "INVALID_OR_UNAVAILABLE" });
    expect(await rpc(anonymousA, "get_public_customer_review", { token: expired }))
      .toMatchObject({ success: false, code: "INVALID_OR_UNAVAILABLE" });
    expect(await rpc(anonymousA, "get_manager_review", { token: "unknown" }))
      .toMatchObject({ success: false, code: "INVALID_OR_UNAVAILABLE" });
  });

  it("rejects all customer/manager credential crossings without mutation", async () => {
    const managerToken = await issue(deurIds[22]);
    const customerResult = await rpc(manager, "command_create_customer_review_request", {
      commandId: randomUUID(), idempotencyKey: "C5B-BOUNDARY-CUSTOMER",
      deurId: deurIds[23], rentalLineId: "UAT-C5B-LINE", revisionId: deurIds[23],
    });
    expect(customerResult).toMatchObject({ success: true });
    const customerToken = (customerResult.value.notification.reviewPath as string)
      .slice("/review/deur/".length);
    const counts = () => JSON.parse(owner(`
      SELECT jsonb_build_object(
        'managerOutcomes',(SELECT count(*) FROM erp.manager_review_outcomes WHERE company_id='${tenant}'),
        'customerOutcomes',(SELECT count(*) FROM erp.customer_review_outcomes WHERE company_id='${tenant}'),
        'managerCorrections',(SELECT count(*) FROM erp.manager_correction_requests WHERE company_id='${tenant}'),
        'customerCorrections',(SELECT count(*) FROM erp.customer_correction_requests WHERE company_id='${tenant}')
      );
    `)).rows[0].jsonb_build_object;
    const before = counts();
    expect(await rpc(anonymousA, "get_manager_review", { token: customerToken }))
      .toMatchObject({ success: false, code: "INVALID_OR_UNAVAILABLE" });
    expect(await rpc(anonymousA, "approve_manager_review", command("CROSS-1", customerToken)))
      .toMatchObject({ success: false, code: "INVALID_OR_UNAVAILABLE" });
    expect(await rpc(anonymousA, "reject_manager_review", command("CROSS-2", customerToken, "Boundary rejection denied.")))
      .toMatchObject({ success: false, code: "INVALID_OR_UNAVAILABLE" });
    expect(await rpc(anonymousA, "request_manager_correction", command("CROSS-3", customerToken, "Boundary correction denied.")))
      .toMatchObject({ success: false, code: "INVALID_OR_UNAVAILABLE" });
    expect(await rpc(anonymousA, "get_public_customer_review", { token: managerToken }))
      .toMatchObject({ success: false, code: "INVALID_OR_UNAVAILABLE" });
    expect(await rpc(anonymousA, "public_acknowledge_customer_review", command("CROSS-4", managerToken)))
      .toMatchObject({ success: false, code: "INVALID_OR_UNAVAILABLE" });
    expect(await rpc(anonymousA, "public_request_customer_correction",
      command("CROSS-5", managerToken, "Boundary correction denied.")))
      .toMatchObject({ success: false, code: "INVALID_OR_UNAVAILABLE" });
    const customerReject = await anonymousA.schema("erp").rpc("public_reject_customer_review", {
      command: command("CROSS-6", customerToken, "No customer rejection exists."),
    });
    expect(customerReject.error).not.toBeNull();
    const catalog = owner(`
      SELECT jsonb_build_object(
        'customerRejectExists',to_regprocedure('erp.public_reject_customer_review(jsonb)') IS NOT NULL
      );
    `);
    expect(counts()).toEqual(before);
    expect(catalog).toContain('"customerRejectExists": false');
  }, 30_000);

  it("keeps customer and manager tokens isolated across two complete tenants", async () => {
    const managerAToken = await issue(deurIds[21], "TENANT-A-MANAGER");
    const customerAResult = await rpc(manager, "command_create_customer_review_request", {
      commandId: randomUUID(), idempotencyKey: "TENANT-A-CUSTOMER",
      deurId: deurIds[20], rentalLineId: "UAT-C5B-LINE", revisionId: deurIds[20],
    });
    const managerBResult = await rpc(managerB, "command_create_manager_review_request", {
      commandId: randomUUID(), idempotencyKey: "TENANT-B-MANAGER",
      deurId: "UAT-C5B-B-DEUR", rentalLineId: "UAT-C5B-B-LINE",
      revisionId: "UAT-C5B-B-DEUR", recipientUserId: actorBId,
    });
    const customerBResult = await rpc(managerB, "command_create_customer_review_request", {
      commandId: randomUUID(), idempotencyKey: "TENANT-B-CUSTOMER",
      deurId: "UAT-C5B-B-DEUR", rentalLineId: "UAT-C5B-B-LINE", revisionId: "UAT-C5B-B-DEUR",
    });
    expect(managerBResult).toMatchObject({ success: true });
    expect(customerAResult).toMatchObject({ success: true });
    expect(customerBResult).toMatchObject({ success: true });
    const managerBToken = (managerBResult.value.notification.reviewPath as string).slice("/review/manager/".length);
    const customerAToken = (customerAResult.value.notification.reviewPath as string).slice("/review/deur/".length);
    const customerBToken = (customerBResult.value.notification.reviewPath as string).slice("/review/deur/".length);
    const managerASnapshot = await rpc(anonymousA, "get_manager_review", { token: managerAToken });
    const managerBSnapshot = await rpc(anonymousA, "get_manager_review", { token: managerBToken });
    const customerASnapshot = await rpc(anonymousA, "get_public_customer_review", { token: customerAToken });
    const customerBSnapshot = await rpc(anonymousA, "get_public_customer_review", { token: customerBToken });
    expect(managerASnapshot.value.project).toBe("C5B Project");
    expect(managerBSnapshot.value.project).toBe("Tenant B Project");
    expect(customerASnapshot.value.project).toBe("C5B Project");
    expect(customerBSnapshot.value.project).toBe("Tenant B Project");
    for (const redirected of [
      { token: managerAToken, companyId: tenantB },
      { token: managerBToken, companyId: tenant },
    ]) {
      expect(await rpc(anonymousA, "get_manager_review", redirected))
        .toMatchObject({ success: false, code: "INVALID_OR_UNAVAILABLE" });
    }
    for (const redirected of [
      { token: customerAToken, revisionId: "UAT-C5B-B-DEUR" },
      { token: customerBToken, revisionId: deurIds[20] },
    ]) {
      expect(await rpc(anonymousA, "get_public_customer_review", redirected))
        .toMatchObject({ success: false, code: "INVALID_OR_UNAVAILABLE" });
    }
    expect(JSON.stringify(managerASnapshot.value)).not.toContain("Tenant B");
    expect(JSON.stringify(managerBSnapshot.value)).not.toContain("C5B Project");
    expect(JSON.stringify(customerASnapshot.value)).not.toContain("Tenant B");
    expect(JSON.stringify(customerBSnapshot.value)).not.toContain("C5B Project");
  });

  it("certifies manager Approve, Reject, and Correction in a real local Chromium browser", async () => {
    let server: ChildProcess | undefined;
    let browser: Browser | undefined;
    const port = 4187;
    const origin = `http://127.0.0.1:${port}`;
    try {
      server = spawn(process.execPath, [
        "node_modules/vite/bin/vite.js",
        "--host", "127.0.0.1", "--port", String(port), "--strictPort",
      ], {
        cwd: process.cwd(),
        windowsHide: true,
        stdio: "ignore",
        env: {
          ...process.env,
          VITE_SUPABASE_URL: configuration.url!,
          VITE_SUPABASE_PUBLISHABLE_KEY: configuration.publishableKey!,
          VITE_REMOTE_OPERATIONAL_WRITES_ENABLED: "false",
        },
      });
      for (let attempt = 0; attempt < 40; attempt += 1) {
        try {
          if ((await fetch(origin)).ok) break;
        } catch {
          await new Promise((resolve) => setTimeout(resolve, 250));
        }
        if (attempt === 39) throw new Error("Local Vite server did not become ready.");
      }
      browser = await chromium.launch({ headless: true });

      const exercise = async (
        deurId: string,
        action: "Approve" | "Reject" | "Request Correction",
        reason?: string,
      ) => {
        const token = await issue(deurId);
        const context = await browser!.newContext();
        const page = await context.newPage();
        const consoleMessages: string[] = [];
        const errors: string[] = [];
        const externalRequests: string[] = [];
        let businessRequests = 0;
        page.on("console", (message) => consoleMessages.push(message.text()));
        page.on("pageerror", (error) => errors.push(error.message));
        page.on("request", (request) => {
          const url = new URL(request.url());
          if (url.origin !== origin && url.origin !== new URL(configuration.url!).origin) {
            externalRequests.push(url.origin);
          }
          if (url.pathname.endsWith(`/rpc/${
            action === "Approve" ? "approve_manager_review"
              : action === "Reject" ? "reject_manager_review" : "request_manager_correction"
          }`)) businessRequests += 1;
        });
        page.on("dialog", (dialog) => void dialog.accept());
        await page.goto(`${origin}/review/manager/${token}`, { waitUntil: "domcontentloaded", timeout: 10_000 });
        await playwrightExpect(page.getByText("C5B Project")).toBeVisible();
        await playwrightExpect(page.getByRole("button", { name: "Approve" })).toBeVisible();
        await playwrightExpect(page.getByRole("button", { name: "Reject" })).toBeVisible();
        await playwrightExpect(page.getByRole("button", { name: "Request Correction" })).toBeVisible();
        await playwrightExpect(page.getByText("Acknowledge", { exact: true })).toHaveCount(0);
        expect(await page.locator("body").innerText()).not.toMatch(/7c5b|UAT-C5B-DEUR|token_hash|request_id/i);
        expect(await page.locator("meta[name=referrer]").getAttribute("content")).toBe("no-referrer");

        if (reason !== undefined) {
          const textarea = page.locator("#manager-reason");
          await textarea.fill("short");
          await page.getByRole("button", { name: action }).click();
          await playwrightExpect(page.getByRole("status")).toContainText("at least 10");
          expect(businessRequests).toBe(0);
          await textarea.fill(reason);
        }
        const button = page.getByRole("button", { name: action });
        await button.dblclick();
        await playwrightExpect(page.getByRole("heading", { name: "Review complete" })).toBeVisible();
        expect(businessRequests).toBe(1);
        expect(page.url()).toBe(`${origin}/review/manager/completed`);
        expect(errors).toEqual([]);
        expect(consoleMessages.join("\n")).not.toContain(token);
        expect(externalRequests).toEqual([]);
        const persisted = await page.evaluate(async (credential) => {
          const local = JSON.stringify(localStorage);
          const session = JSON.stringify(sessionStorage);
          const cookies = document.cookie;
          const databases = indexedDB.databases ? await indexedDB.databases() : [];
          const cacheNames = "caches" in window ? await caches.keys() : [];
          return {
            local: local.includes(credential),
            session: session.includes(credential),
            cookies: cookies.includes(credential),
            indexedDbNames: databases.some((database) => database.name?.includes(credential)),
            cacheNames: cacheNames.some((name) => name.includes(credential)),
          };
        }, token);
        expect(persisted).toEqual({
          local: false, session: false, cookies: false, indexedDbNames: false, cacheNames: false,
        });
        await page.reload({ waitUntil: "domcontentloaded", timeout: 10_000 });
        await playwrightExpect(page.getByRole("heading", { name: "Review complete" })).toBeVisible();
        expect(page.url()).toBe(`${origin}/review/manager/completed`);
        await page.goto(`${origin}/review/manager/${token}`, {
          waitUntil: "domcontentloaded", timeout: 10_000,
        });
        await playwrightExpect(page.getByRole("heading", { name: "Review unavailable" })).toBeVisible();
        await context.close();
      };

      await exercise(deurIds[24], "Approve");
      await exercise(deurIds[25], "Reject", "  <script>inert</script> incorrect duration.  ");
      await exercise(deurIds[26], "Request Correction", "Incorrect operating duration.");

      const invalidStates = [
        { token: "malformed", heading: "Review unavailable" },
        { token: await issue(deurIds[27]), state: "Expired" },
        { token: await issue(deurIds[28]), state: "Revoked" },
        { token: await issue(deurIds[29]), state: "Superseded" },
      ];
      owner(`
        UPDATE erp.manager_review_requests SET expires_at=clock_timestamp()-interval '1 second'
          WHERE company_id='${tenant}' AND revision_id='${deurIds[27]}';
        UPDATE erp.manager_review_requests SET status='Revoked',revoked_at=clock_timestamp()
          WHERE company_id='${tenant}' AND revision_id='${deurIds[28]}';
        UPDATE erp.manager_review_requests SET status='Superseded',superseded_at=clock_timestamp(),revoked_at=clock_timestamp()
          WHERE company_id='${tenant}' AND revision_id='${deurIds[29]}';
      `);
      for (const item of invalidStates) {
        const page = await browser.newPage();
        const errors: string[] = [];
        page.on("pageerror", (error) => errors.push(error.message));
        await page.goto(`${origin}/review/manager/${item.token}`, { waitUntil: "domcontentloaded", timeout: 10_000 });
        await playwrightExpect(page.getByRole("heading", { name: item.heading ?? "Review unavailable" })).toBeVisible();
        await playwrightExpect(page.getByRole("button", { name: "Approve" })).toHaveCount(0);
        expect(errors).toEqual([]);
        await page.close();
      }
    } finally {
      await browser?.close();
      server?.kill();
    }
  }, 120_000);

  it("certifies fresh manager delivered link against the deployed isolated-UAT frontend", async () => {
    const issued = await rpc(manager, "trusted_issue_manager_review", {
      commandId: `C5C2-MANAGER-${randomUUID()}`,
      idempotencyKey: `C5C2-MANAGER-${randomUUID()}`,
      deurId: deurIds[30],
      rentalLineId: "UAT-C5B-LINE",
      revisionId: deurIds[30],
      recipientUserId: actorId,
    });
    expect(issued).toMatchObject({ success: true, disposition: "ACCEPTED" });
    const reviewPath = issued.value.notification.reviewPath as string;
    const token = reviewPath.slice("/review/manager/".length);
    const notificationIntentId = issued.value.notificationIntentId as string;
    expect(await rpc(anonymousA, "get_manager_review", { token }))
      .toMatchObject({ success: true, disposition: "AVAILABLE" });

    const intentResult = await harness!.admin.schema("erp").rpc("get_notification_delivery_intent", {
      notification_id: notificationIntentId,
    });
    expect(intentResult.error).toBeNull();
    expect(intentResult.data).toMatchObject({ success: true });
    const intent = intentResult.data.value;
    const workerId = randomUUID();
    const claim = await harness!.admin.schema("erp").rpc("claim_notification_delivery", {
      notification_id: notificationIntentId,
      worker_id: workerId,
    });
    expect(claim.error).toBeNull();
    expect(claim.data).toMatchObject({ success: true });

    const notificationConfiguration = parseNotificationServerConfiguration(process.env);
    const readbackApiKey = process.env.RESEND_READBACK_API_KEY?.trim();
    if (!readbackApiKey) {
      throw new Error("Missing required server-only provider configuration: RESEND_READBACK_API_KEY");
    }
    const provider = new ResendEmailDeliveryProvider({
      apiKey: notificationConfiguration.resendApiKey,
      uatRecipientOverride: notificationConfiguration.uatRecipientOverride,
      timeoutMs: 15_000,
    });
    const reviewUrl = new URL(reviewPath, notificationConfiguration.publicBaseUrl).toString();
    const delivered = await provider.send({
      from: notificationConfiguration.fromAddress,
      to: intent.recipient.destination,
      recipientName: intent.recipient.displayName,
      email: renderNotificationTemplate(intent.type, { ...intent.input, reviewUrl }),
      idempotencyKey: intent.idempotencyKey,
    });
    expect(delivered.accepted).toBe(true);
    if (!delivered.accepted) throw new Error("Manager provider delivery was not accepted.");
    const completion = await harness!.admin.schema("erp").rpc("complete_notification_delivery", {
      command: {
        id: notificationIntentId,
        workerId,
        status: "ProviderAccepted",
        providerName: delivered.provider,
        providerMessageId: delivered.providerMessageId,
      },
    });
    expect(completion.error).toBeNull();
    expect(completion.data).toMatchObject({ success: true });

    let providerEvent = "";
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const response = await fetch(`https://api.resend.com/emails/${delivered.providerMessageId}`, {
        headers: { Authorization: `Bearer ${readbackApiKey}` },
      });
      expect(response.status).toBe(200);
      const message = await response.json() as {
        id?: string;
        to?: string[];
        from?: string;
        subject?: string;
        html?: string;
        text?: string;
        last_event?: string;
      };
      expect(message.id).toBe(delivered.providerMessageId);
      expect(message.to).toContain(notificationConfiguration.uatRecipientOverride);
      expect(message.from).toContain(notificationConfiguration.fromAddress);
      expect(message.subject).toContain("[UAT]");
      expect(`${message.html ?? ""}\n${message.text ?? ""}`).toContain(reviewUrl);
      providerEvent = message.last_event ?? "";
      if (["delivered", "opened", "clicked"].includes(providerEvent)) break;
      await new Promise((resolve) => setTimeout(resolve, 1_000));
    }
    expect(["delivered", "opened", "clicked"]).toContain(providerEvent);

    const browser = await chromium.launch({ headless: true });
    try {
      const context = await browser.newContext();
      const page = await context.newPage();
      const errors: string[] = [];
      const externalOrigins = new Set<string>();
      page.on("pageerror", (error) => errors.push(error.message));
      page.on("console", (message) => {
        if (message.type() === "error") errors.push(message.text());
      });
      page.on("request", (request) => {
        const requestOrigin = new URL(request.url()).origin;
        if (![
          new URL(notificationConfiguration.publicBaseUrl).origin,
          new URL(configuration.url!).origin,
        ].includes(requestOrigin)) externalOrigins.add(requestOrigin);
      });
      page.on("dialog", (dialog) => void dialog.accept());
      await page.goto(reviewUrl, { waitUntil: "domcontentloaded", timeout: 15_000 });
      await playwrightExpect(page.getByText("C5B Project")).toBeVisible({ timeout: 15_000 });
      await playwrightExpect(page.getByRole("button", { name: "Approve" })).toBeVisible();
      await playwrightExpect(page.getByRole("button", { name: "Reject" })).toBeVisible();
      await playwrightExpect(page.getByRole("button", { name: "Request Correction" })).toBeVisible();
      await playwrightExpect(page.getByRole("button", { name: "Acknowledge" })).toHaveCount(0);
      expect(await page.locator("meta[name=referrer]").getAttribute("content")).toBe("no-referrer");
      const [approveResponse] = await Promise.all([
        page.waitForResponse((response) =>
          new URL(response.url()).pathname.endsWith("/rpc/approve_manager_review")),
        page.getByRole("button", { name: "Approve" }).click(),
      ]);
      const approveResult = await approveResponse.json() as {
        success?: boolean; disposition?: string; code?: string;
      };
      expect({
        status: approveResponse.status(),
        success: approveResult.success,
        disposition: approveResult.disposition,
        code: approveResult.code,
      }).toMatchObject({ status: 200, success: true, disposition: "ACCEPTED" });
      await playwrightExpect(page.getByRole("heading", { name: "Review complete" }))
        .toBeVisible({ timeout: 15_000 });
      expect(page.url()).toBe(
        `${notificationConfiguration.publicBaseUrl.replace(/\/$/, "")}/review/manager/completed`,
      );
      const persisted = await page.evaluate(async (credential) => ({
        local: JSON.stringify(localStorage).includes(credential),
        session: JSON.stringify(sessionStorage).includes(credential),
        cookies: document.cookie.includes(credential),
        indexedDbNames: (indexedDB.databases ? await indexedDB.databases() : [])
          .some((database) => database.name?.includes(credential)),
        cacheNames: ("caches" in window ? await caches.keys() : [])
          .some((name) => name.includes(credential)),
      }), token);
      expect(persisted).toEqual({
        local: false,
        session: false,
        cookies: false,
        indexedDbNames: false,
        cacheNames: false,
      });
      await page.reload({ waitUntil: "domcontentloaded", timeout: 15_000 });
      await playwrightExpect(page.getByRole("heading", { name: "Review complete" })).toBeVisible();
      await page.goto(reviewUrl, { waitUntil: "domcontentloaded", timeout: 15_000 });
      await playwrightExpect(page.getByRole("heading", { name: "Review unavailable" })).toBeVisible();
      expect(errors).toEqual([]);
      expect([...externalOrigins]).toEqual([]);
      await context.close();
    } finally {
      await browser.close();
    }
    expect(await rpc(anonymousA, "get_manager_review", { token }))
      .toMatchObject({ success: true, disposition: "ALREADY_COMPLETED" });
    const outcomeIntent = ownerValue(`
      SELECT jsonb_build_object('id',(SELECT id FROM erp.notification_outbox
        WHERE company_id='${tenant}' AND notification_type='MANAGER_APPROVED'
        AND review_request_id=(SELECT id FROM erp.manager_review_requests
          WHERE company_id='${tenant}' AND revision_id='${deurIds[30]}')
        ORDER BY created_at DESC LIMIT 1));
    `);
    expect(outcomeIntent.id).toBeTruthy();
    const outcomeResult = await harness!.admin.schema("erp").rpc("get_notification_delivery_intent", {
      notification_id: outcomeIntent.id,
    });
    expect(outcomeResult.error).toBeNull();
    expect(outcomeResult.data).toMatchObject({ success: true });
    const outcome = outcomeResult.data.value;
    expect(outcome.type).toBe("MANAGER_APPROVED");
    const outcomeWorker = randomUUID();
    const outcomeClaim = await harness!.admin.schema("erp").rpc("claim_notification_delivery", {
      notification_id: outcomeIntent.id,
      worker_id: outcomeWorker,
    });
    expect(outcomeClaim.error).toBeNull();
    expect(outcomeClaim.data).toMatchObject({ success: true });
    const outcomeDelivery = await provider.send({
      from: notificationConfiguration.fromAddress,
      to: outcome.recipient.destination,
      recipientName: outcome.recipient.displayName,
      email: renderNotificationTemplate(outcome.type, outcome.input),
      idempotencyKey: outcome.idempotencyKey,
    });
    expect(outcomeDelivery.accepted).toBe(true);
    if (!outcomeDelivery.accepted) throw new Error("Manager outcome delivery was not accepted.");
    const outcomeCompletion = await harness!.admin.schema("erp").rpc("complete_notification_delivery", {
      command: {
        id: outcomeIntent.id,
        workerId: outcomeWorker,
        status: "ProviderAccepted",
        providerName: outcomeDelivery.provider,
        providerMessageId: outcomeDelivery.providerMessageId,
      },
    });
    expect(outcomeCompletion.error).toBeNull();
    expect(outcomeCompletion.data).toMatchObject({ success: true });
    const outcomeReadback = await fetch(
      `https://api.resend.com/emails/${outcomeDelivery.providerMessageId}`,
      { headers: { Authorization: `Bearer ${readbackApiKey}` } },
    );
    expect(outcomeReadback.status).toBe(200);
    const outcomeMessage = await outcomeReadback.json() as {
      id?: string; to?: string[]; from?: string; subject?: string;
      html?: string; text?: string; last_event?: string;
    };
    expect(outcomeMessage.id).toBe(outcomeDelivery.providerMessageId);
    expect(outcomeMessage.to).toContain(notificationConfiguration.uatRecipientOverride);
    expect(outcomeMessage.from).toContain(notificationConfiguration.fromAddress);
    expect(outcomeMessage.subject).toBeTruthy();
    expect(outcomeMessage.last_event).toBeTruthy();
    const outcomeBody = `${outcomeMessage.html ?? ""}\n${outcomeMessage.text ?? ""}`;
    expect(outcomeBody).toContain("UAT-C5B-RENTAL");
    expect(outcomeBody).not.toMatch(/\/review\/(?:deur|manager)\/|<script|javascript:/i);
    expect(outcomeBody).not.toContain(configuration.serviceKey);
    expect(outcomeBody).not.toContain(tenant);
    const outcomeUrls = [...outcomeBody.matchAll(/https?:\/\/[^\s"'<>]+/gi)]
      .map((match) => match[0]);
    const configuredOrigin = new URL(notificationConfiguration.publicBaseUrl).origin;
    expect(outcomeUrls.every((url) => {
      try {
        return new URL(url.replaceAll("&amp;", "&")).origin === configuredOrigin;
      } catch {
        return false;
      }
    })).toBe(true);
    const evidence = owner(`
      SELECT jsonb_build_object(
        'accepted',(SELECT status='ProviderAccepted' AND provider_message_id IS NOT NULL
          FROM erp.notification_outbox WHERE id='${notificationIntentId}'),
        'outcomes',(SELECT count(*) FROM erp.manager_review_outcomes
          WHERE company_id='${tenant}' AND revision_id='${deurIds[30]}'),
        'rawPersisted',EXISTS(
          SELECT 1 FROM erp.notification_outbox WHERE company_id='${tenant}'
            AND to_jsonb(notification_outbox)::text LIKE '%${token}%'
          UNION ALL
          SELECT 1 FROM erp.notification_delivery_attempts WHERE company_id='${tenant}'
            AND to_jsonb(notification_delivery_attempts)::text LIKE '%${token}%'
          UNION ALL
          SELECT 1 FROM erp.audit_log WHERE company_id='${tenant}'
            AND to_jsonb(audit_log)::text LIKE '%${token}%'
        )
      );
    `);
    expect(evidence).toContain('"accepted": true');
    expect(evidence).toContain('"outcomes": 1');
    expect(evidence).toContain('"rawPersisted": false');
  }, 120_000);

  it("serializes all eight genuine races and repeats incompatible races", async () => {
    const race = async (
      deurId: string,
      rpcA: string,
      rpcB: string,
      keyA: string,
      keyB: string,
      reasonA?: string,
      reasonB?: string,
    ) => {
      const token = await issue(deurId);
      const result = await executeParallelCommandRace({
        clientA: anonymousA, clientB: anonymousB, rpcA, rpcB,
        commandA: command(keyA, token, reasonA),
        commandB: command(keyB, token, reasonB),
      });
      expect(result.deadlock).toBe(false);
      expect(result.overlapped).toBe(true);
      const responses = [result.a.data, result.b.data] as any[];
      expect(responses.filter((item) => item?.success && item.disposition === "ACCEPTED")).toHaveLength(1);
      const integrity = owner(`
        SELECT jsonb_build_object(
          'outcomes',(SELECT count(*) FROM erp.manager_review_outcomes WHERE company_id='${tenant}' AND revision_id='${deurId}'),
          'workItems',(SELECT count(*) FROM erp.manager_correction_requests WHERE company_id='${tenant}' AND source_revision_id='${deurId}')
        );
      `);
      expect(integrity).toContain('"outcomes": 1');
      const winner = responses.find((item) => item?.success && item.disposition === "ACCEPTED");
      const loser = responses.find((item) => item !== winner);
      console.info(JSON.stringify({
        race: deurId,
        winner: winner?.value?.reviewStatus,
        loser: loser?.disposition ?? loser?.code,
        durationMs: Math.max(result.a.finishedAt, result.b.finishedAt)
          - Math.min(result.a.startedAt, result.b.startedAt),
        releaseSkewMs: result.releaseSkewMs,
        overlapped: result.overlapped,
        deadlock: result.deadlock,
        finalIntegrity: true,
      }));
      return { result, responses, integrity };
    };
    const approve = "approve_manager_review";
    const reject = "reject_manager_review";
    const correction = "request_manager_correction";
    await race(deurIds[7], approve, approve, "R1", "R1");
    await race(deurIds[8], approve, reject, "R2A", "R2B", undefined, "Valid rejection reason.");
    await race(deurIds[9], approve, correction, "R3A", "R3B", undefined, "Valid correction reason.");
    await race(deurIds[10], reject, correction, "R4A", "R4B", "Valid rejection reason.", "Valid correction reason.");
    await race(deurIds[11], reject, reject, "R5", "R5", "Duplicate rejection reason.", "Duplicate rejection reason.");
    await race(deurIds[12], correction, correction, "R6", "R6", "Duplicate correction reason.", "Duplicate correction reason.");
    const same = await race(deurIds[13], reject, reject, "R7", "R7", "Same payload reason.", "Same payload reason.");
    expect(same.responses.some((item) => item?.disposition === "REPLAYED")).toBe(true);
    const mismatch = await race(deurIds[14], reject, correction, "R8", "R8", "First immutable reason.", "Different immutable reason.");
    expect(mismatch.responses.some((item) => item?.code === "IDEMPOTENCY_MISMATCH")).toBe(true);
    const incompatible = [[approve, reject], [approve, correction], [reject, correction]];
    for (let repetition = 0; repetition < 2; repetition += 1) {
      for (const [index, pair] of incompatible.entries()) {
        await race(deurIds[15 + repetition * 3 + index], pair[0], pair[1],
          `REPEAT-${repetition}-${index}-A`, `REPEAT-${repetition}-${index}-B`,
          pair[0] === reject ? "Repeated rejection reason." : undefined,
          pair[1] === reject ? "Repeated rejection reason." : "Repeated correction reason.");
      }
    }
  }, 120_000);
});
