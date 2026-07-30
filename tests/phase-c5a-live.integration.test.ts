import { randomBytes, randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { chromium, expect as playwrightExpect } from "@playwright/test";
import {
  assertSupabaseFixtureMutationAllowed,
  createSupabasePhaseC2Harness,
  readSupabasePhaseC2TestConfiguration,
} from "./support/supabasePhaseC2Harness";
import { executePhaseC4bPrivilegedSql } from "./support/phaseC4bPrivilegedSql";
import { executeParallelCommandRace } from "./support/parallelCommandRace";
import { FakeEmailDeliveryProvider } from "../server/notifications/FakeEmailDeliveryProvider";
import { ResendEmailDeliveryProvider } from "../server/notifications/ResendEmailDeliveryProvider";
import { parseNotificationServerConfiguration } from "../server/notifications/config";
import { renderNotificationTemplate } from "@/features/notifications/templates";

const configuration = readSupabasePhaseC2TestConfiguration();
const enabled = configuration.enabled && process.env.RUN_PHASE_C5A_LIVE === "true";
const tenant = "TENANT-UAT-C5A-REVIEW";
const actorId = "7c5a0000-0000-4000-8000-000000000001";
const actorEmail = "tenant-uat-c5a-operations@example.invalid";
const password = `C5A-${randomBytes(24).toString("base64url")}`;
const deurIds = Array.from({ length: 15 }, (_, index) => `UAT-C5A-DEUR-${index + 1}`);

describe.skipIf(!enabled)("Phase C5A secure public customer review live validation", () => {
  const harness = enabled ? createSupabasePhaseC2Harness(configuration) : undefined;
  let operations: SupabaseClient;
  let operationsB: SupabaseClient;
  let anonymousA: SupabaseClient;
  let anonymousB: SupabaseClient;
  const tokens = new Map<string, string>();

  const owner = (sql: string) =>
    executePhaseC4bPrivilegedSql(configuration, { tenantIds: [tenant], sql });

  function cleanup(): void {
    owner(`
      BEGIN;
      SET LOCAL session_replication_role='replica';
      DELETE FROM erp.notification_delivery_attempts WHERE company_id='${tenant}';
      DELETE FROM erp.notification_outbox WHERE company_id='${tenant}';
      WITH deleted AS (DELETE FROM erp.customer_review_outcomes WHERE company_id='${tenant}' RETURNING 1)
        SELECT count(*) AS deleted FROM deleted;
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
      DELETE FROM erp.user_roles WHERE user_id='${actorId}'::uuid;
      DELETE FROM erp.users WHERE company_id='${tenant}';
      DELETE FROM erp.role_permissions WHERE role_id='ROLE-UAT-C5A-OPS';
      DELETE FROM erp.app_roles WHERE id='ROLE-UAT-C5A-OPS';
      DELETE FROM erp.app_permissions WHERE id IN('PERM-UAT-C5A-DEUR-REVIEW','PERM-UAT-C5A-DEUR-CORRECT');
      DELETE FROM erp.companies WHERE id='${tenant}';
      COMMIT;
    `);
  }

  async function rpc(
    client: SupabaseClient,
    name: string,
    command: Record<string, unknown>,
  ): Promise<any> {
    const result = await client.schema("erp").rpc(name, { command });
    expect(result.error, `${name}: ${result.error?.code ?? ""} ${result.error?.message ?? ""}`).toBeNull();
    return result.data;
  }

  async function issue(deurId: string) {
    const result = await rpc(operations, "command_create_customer_review_request", {
      commandId: `ISSUE-${deurId}`,
      idempotencyKey: `ISSUE-${deurId}`,
      deurId,
      rentalLineId: "UAT-C5A-LINE",
      revisionId: deurId,
    });
    expect(result).toMatchObject({ success: true, disposition: "ACCEPTED" });
    const reviewPath = result.value.notification.reviewPath as string;
    expect(reviewPath).toMatch(/^\/review\/deur\/[0-9a-f]{64}$/);
    const token = reviewPath.slice("/review/deur/".length);
    tokens.set(deurId, token);
    expect(JSON.stringify(result.value.notification)).not.toContain("tokenHash");
    return token;
  }

  const command = (prefix: string, token: string, reason?: string) => ({
    token,
    commandId: `${prefix}-${randomUUID()}`,
    idempotencyKey: prefix,
    ...(reason === undefined ? {} : { reason }),
  });

  const ownerValue = (sql: string): any => {
    const output = JSON.parse(owner(sql));
    return output.rows[0].jsonb_build_object;
  };

  const deliverAndReadback = async (notificationIntentId: string, suppliedReviewPath?: string) => {
    const notificationConfiguration = parseNotificationServerConfiguration(process.env);
    const readbackApiKey = process.env.RESEND_READBACK_API_KEY?.trim();
    if (!readbackApiKey) {
      throw new Error("Missing required server-only provider configuration: RESEND_READBACK_API_KEY");
    }
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
    const reviewPath = suppliedReviewPath;
    const reviewUrl = reviewPath
      ? new URL(reviewPath, notificationConfiguration.publicBaseUrl).toString()
      : undefined;
    const provider = new ResendEmailDeliveryProvider({
      apiKey: notificationConfiguration.resendApiKey,
      uatRecipientOverride: notificationConfiguration.uatRecipientOverride,
      timeoutMs: 15_000,
    });
    const delivered = await provider.send({
      from: notificationConfiguration.fromAddress,
      to: intent.recipient.destination,
      recipientName: intent.recipient.displayName,
      email: renderNotificationTemplate(intent.type, { ...intent.input, reviewUrl }),
      idempotencyKey: intent.idempotencyKey,
    });
    expect(delivered.accepted).toBe(true);
    if (!delivered.accepted) throw new Error("Provider delivery was not accepted.");
    const completed = await harness!.admin.schema("erp").rpc("complete_notification_delivery", {
      command: {
        id: notificationIntentId,
        workerId,
        status: "ProviderAccepted",
        providerName: delivered.provider,
        providerMessageId: delivered.providerMessageId,
      },
    });
    expect(completed.error).toBeNull();
    expect(completed.data).toMatchObject({ success: true });
    const response = await fetch(`https://api.resend.com/emails/${delivered.providerMessageId}`, {
      headers: { Authorization: `Bearer ${readbackApiKey}` },
    });
    expect(response.status).toBe(200);
    const message = await response.json() as {
      id?: string; to?: string[]; from?: string; subject?: string;
      html?: string; text?: string; last_event?: string;
    };
    expect(message.id).toBe(delivered.providerMessageId);
    expect(message.to).toContain(notificationConfiguration.uatRecipientOverride);
    expect(message.from).toContain(notificationConfiguration.fromAddress);
    expect(message.subject).toBeTruthy();
    expect(message.last_event).toBeTruthy();
    const body = `${message.html ?? ""}\n${message.text ?? ""}`;
    expect(body).not.toContain(configuration.serviceKey);
    expect(body).not.toContain(tenant);
    expect(body).not.toMatch(/<script|javascript:|[\r\n](?:to|from|subject):/i);
    const urls = [...body.matchAll(/https?:\/\/[^\s"'<>]+/gi)].map((match) => match[0]);
    const allowedOrigin = new URL(notificationConfiguration.publicBaseUrl).origin;
    expect(urls.every((url) => {
      try {
        const origin = new URL(url.replaceAll("&amp;", "&")).origin;
        return origin === allowedOrigin;
      } catch {
        return false;
      }
    })).toBe(true);
    if (reviewUrl) expect(body).toContain(reviewUrl);
    else expect(body).not.toMatch(/\/review\/(?:deur|manager)\//);
    return { intent, reviewUrl, body };
  };

  beforeAll(async () => {
    assertSupabaseFixtureMutationAllowed(configuration, [tenant]);
    cleanup();
    const created = await harness!.admin.auth.admin.createUser({
      id: actorId,
      email: actorEmail,
      password,
      email_confirm: true,
    });
    if (created.error) throw created.error;
    owner(`
      BEGIN;
      INSERT INTO erp.companies(id,code,name,environment_class)
        VALUES('${tenant}','${tenant}','C5A Customer Review','test');
      INSERT INTO erp.operators(id,name,status,company_id)
        VALUES('UAT-C5A-OP','C5A Operator','Active','${tenant}');
      INSERT INTO erp.users(id,username,display_name,status,operator_id,company_id)
        VALUES('${actorId}'::uuid,'${actorEmail}','C5A Operations','active','UAT-C5A-OP','${tenant}');
      INSERT INTO erp.app_roles(id,code,name)
        VALUES('ROLE-UAT-C5A-OPS','rental-operations-c5a','C5A Operations');
      INSERT INTO erp.app_permissions(id,code,name) VALUES
        ('PERM-UAT-C5A-DEUR-REVIEW','deur.review','DEUR Review'),
        ('PERM-UAT-C5A-DEUR-CORRECT','deur.correct','DEUR Correct');
      INSERT INTO erp.role_permissions(role_id,permission_id)
        VALUES
          ('ROLE-UAT-C5A-OPS','PERM-UAT-C5A-DEUR-REVIEW'),
          ('ROLE-UAT-C5A-OPS','PERM-UAT-C5A-DEUR-CORRECT');
      INSERT INTO erp.user_roles(user_id,role_id)
        VALUES('${actorId}'::uuid,'ROLE-UAT-C5A-OPS');
      INSERT INTO erp.customers(id,customer_code,name,email,company_id)
        VALUES('UAT-C5A-CUSTOMER','UAT-C5A-CUST','C5A Customer','customer-c5a@example.invalid','${tenant}');
      INSERT INTO erp.projects(id,project_code,name,customer_id,company_id)
        VALUES('UAT-C5A-PROJECT','UAT-C5A-PROJ','C5A Project','UAT-C5A-CUSTOMER','${tenant}');
      INSERT INTO erp.equipment(id,asset_no,equipment_name,maintenance_type,company_id)
        VALUES('UAT-C5A-EQ','UAT-C5A-EQ','C5A Excavator','None','${tenant}');
      INSERT INTO erp.assignments(id,equipment_id,operator_id,project_id,assigned_date,expected_return,status,company_id)
        VALUES('UAT-C5A-ASG','UAT-C5A-EQ','UAT-C5A-OP','UAT-C5A-PROJECT','2026-07-01','2026-12-31','Active','${tenant}');
      INSERT INTO erp.rentals(id,rental_number,customer_id,project_id,customer_snapshot,project_snapshot,date_out,status,company_id)
        VALUES('UAT-C5A-RENTAL','UAT-C5A-RENTAL','UAT-C5A-CUSTOMER','UAT-C5A-PROJECT','C5A Customer','C5A Project','2026-07-01','Active','${tenant}');
      INSERT INTO erp.rental_equipment_lines(id,rental_id,equipment_id,assignment_id,operator_id,status,company_id)
        VALUES('UAT-C5A-LINE','UAT-C5A-RENTAL','UAT-C5A-EQ','UAT-C5A-ASG','UAT-C5A-OP','Active','${tenant}');
      ${deurIds.map((id, index) => `
        INSERT INTO erp.deurs(
          id,deur_number,rental_id,rental_equipment_line_id,equipment_id,operator_id,
          project_id,customer_id,work_date,shift,status,evidence_mode,total_operating_minutes,
          total_idle_minutes,total_standby_minutes,opening_meter,closing_meter,submitted_at,
          revision_chain_id,revision_number,original_deur_id,company_id
        ) VALUES(
          '${id}','${id}','UAT-C5A-RENTAL','UAT-C5A-LINE','UAT-C5A-EQ','UAT-C5A-OP',
          'UAT-C5A-PROJECT','UAT-C5A-CUSTOMER','2026-08-${String(index + 1).padStart(2, "0")}',
          'Day','Submitted','TIME_TIMELINE',360,30,30,100,110,now(),
          '${id}',1,'${id}','${tenant}'
        );
        INSERT INTO erp.deur_events(id,deur_id,activity_type,action,occurred_at,sequence,source,actor_id,is_open,company_id)
        VALUES
          ('${id}-E1','${id}','shift','start','2026-08-${String(index + 1).padStart(2, "0")} 08:00+00',1,'operator','${actorId}',false,'${tenant}'),
          ('${id}-E2','${id}','operation','start','2026-08-${String(index + 1).padStart(2, "0")} 08:00+00',2,'operator','${actorId}',false,'${tenant}'),
          ('${id}-E3','${id}','operation','end','2026-08-${String(index + 1).padStart(2, "0")} 14:00+00',3,'operator','${actorId}',false,'${tenant}'),
          ('${id}-E4','${id}','shift','end','2026-08-${String(index + 1).padStart(2, "0")} 14:00+00',4,'operator','${actorId}',false,'${tenant}');
      `).join("\n")}
      COMMIT;
    `);
    operations = createClient(configuration.url!, configuration.publishableKey!, {
      auth: { persistSession: false, autoRefreshToken: false, storageKey: "c5a-operations" },
    });
    operationsB = createClient(configuration.url!, configuration.publishableKey!, {
      auth: { persistSession: false, autoRefreshToken: false, storageKey: "c5a-operations-b" },
    });
    anonymousA = createClient(configuration.url!, configuration.publishableKey!, {
      auth: { persistSession: false, autoRefreshToken: false, storageKey: "c5a-anon-a" },
    });
    anonymousB = createClient(configuration.url!, configuration.publishableKey!, {
      auth: { persistSession: false, autoRefreshToken: false, storageKey: "c5a-anon-b" },
    });
    const login = await operations.auth.signInWithPassword({ email: actorEmail, password });
    if (login.error) throw login.error;
    const loginB = await operationsB.auth.signInWithPassword({ email: actorEmail, password });
    if (loginB.error) throw loginB.error;
  }, 90_000);

  afterAll(async () => {
    await operations?.auth.signOut();
    await operationsB?.auth.signOut();
    cleanup();
    cleanup();
    await harness!.admin.auth.admin.deleteUser(actorId);
  }, 90_000);

  it("exposes only the approved anonymous RPC catalog and no direct table mutation", async () => {
    const catalog = owner(`
      SELECT jsonb_build_object(
        'publicFunctions',(
          SELECT jsonb_agg(p.proname ORDER BY p.proname)
          FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
          WHERE n.nspname='erp' AND has_function_privilege('anon',p.oid,'EXECUTE')
        ),
        'outcomeRls',(SELECT relrowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='erp' AND c.relname='customer_review_outcomes'),
        'correctionRls',(SELECT relrowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='erp' AND c.relname='customer_correction_requests'),
        'legacyPublicAction',to_regprocedure('erp.public_reject_customer_review(jsonb)') IS NOT NULL
      );
    `);
    expect(catalog).toContain("get_public_customer_review");
    expect(catalog).toContain("public_acknowledge_customer_review");
    expect(catalog).toContain("public_request_customer_correction");
    expect(catalog).toContain('"legacyPublicAction": false');
    const direct = await anonymousA.schema("erp").from("customer_review_requests")
      .update({ status: "Acknowledged" }).eq("company_id", tenant);
    expect(direct.error).not.toBeNull();
  });

  it("issues, reads, acknowledges, and replays without persisted raw credentials", async () => {
    const token = await issue(deurIds[0]);
    const read = await rpc(anonymousA, "get_public_customer_review", { token });
    expect(read).toMatchObject({
      success: true,
      disposition: "AVAILABLE",
      value: {
        rentalReference: "UAT-C5A-RENTAL",
        customerName: "C5A Customer",
        availableActions: ["ACKNOWLEDGE", "REQUEST_CORRECTION"],
      },
    });
    expect(read.value).not.toHaveProperty("deurId");
    expect(read.value).not.toHaveProperty("requestId");
    const ackCommand = command("C5A-ACK-1", token);
    const accepted = await rpc(anonymousA, "public_acknowledge_customer_review", ackCommand);
    expect(accepted).toMatchObject({ success: true, disposition: "ACCEPTED", value: { reviewStatus: "Acknowledged" } });
    const replay = await rpc(anonymousB, "public_acknowledge_customer_review", {
      ...ackCommand,
      commandId: randomUUID(),
    });
    expect(replay).toMatchObject({ success: true, disposition: "REPLAYED" });
    const persistence = owner(`
      SELECT jsonb_build_object(
        'outcomes',(SELECT count(*) FROM erp.customer_review_outcomes WHERE company_id='${tenant}' AND action='ACKNOWLEDGE'),
        'rawPersisted',EXISTS(
          SELECT 1 FROM erp.customer_review_requests WHERE company_id='${tenant}' AND to_jsonb(customer_review_requests)::text LIKE '%${token}%'
          UNION ALL SELECT 1 FROM erp.audit_log WHERE company_id='${tenant}' AND to_jsonb(audit_log)::text LIKE '%${token}%'
          UNION ALL SELECT 1 FROM erp.operational_command_idempotency WHERE company_id='${tenant}' AND to_jsonb(operational_command_idempotency)::text LIKE '%${token}%'
        )
      );
    `);
    expect(persistence).toContain('"outcomes": 1');
    expect(persistence).toContain('"rawPersisted": false');
  });

  it("validates and durably records Request Correction without editing DEUR evidence", async () => {
    const token = await issue(deurIds[1]);
    expect(await rpc(anonymousA, "public_request_customer_correction", command("C5A-EMPTY", token, "")))
      .toMatchObject({ success: false, code: "VALIDATION_REJECTED" });
    expect(await rpc(anonymousA, "public_request_customer_correction", command("C5A-LONG", token, "x".repeat(1001))))
      .toMatchObject({ success: false, code: "VALIDATION_REJECTED" });
    expect(await rpc(anonymousA, "public_request_customer_correction", {
      ...command("C5A-UNKNOWN", token, "Incorrect operating duration."),
      patch: { operationMinutes: 1 },
    })).toMatchObject({ success: false, code: "VALIDATION_REJECTED" });
    const correctionCommand = command("C5A-CORRECTION-1", token, "Incorrect operating duration.");
    expect(await rpc(anonymousA, "public_request_customer_correction", correctionCommand))
      .toMatchObject({ success: true, disposition: "ACCEPTED", value: { reviewStatus: "CorrectionRequested" } });
    expect(await rpc(anonymousB, "public_request_customer_correction", {
      ...correctionCommand,
      commandId: randomUUID(),
    })).toMatchObject({ success: true, disposition: "REPLAYED" });
    const evidence = owner(`
      SELECT jsonb_build_object(
        'workItems',(SELECT count(*) FROM erp.customer_correction_requests WHERE company_id='${tenant}' AND customer_reason='Incorrect operating duration.'),
        'outcomes',(SELECT count(*) FROM erp.customer_review_outcomes WHERE company_id='${tenant}' AND action='REQUEST_CORRECTION'),
        'deurStatus',(SELECT status FROM erp.deurs WHERE id='${deurIds[1]}'),
        'events',(SELECT count(*) FROM erp.deur_events WHERE deur_id='${deurIds[1]}')
      );
    `);
    expect(evidence).toContain('"workItems": 1');
    expect(evidence).toContain('"outcomes": 1');
    expect(evidence).toContain('"deurStatus": "Submitted"');
    expect(evidence).toContain('"events": 4');
    const sourceVersion = await operations.schema("erp").from("deurs")
      .select("row_version").eq("id", deurIds[1]).single();
    expect(sourceVersion.error).toBeNull();
    const corrected = await rpc(operations, "command_create_deur_correction", {
      commandId: "C5A-CREATE-R2",
      idempotencyKey: "C5A-CREATE-R2",
      sourceRevisionId: deurIds[1],
      expectedVersion: sourceVersion.data!.row_version,
      reasonCode: "CUSTOMER_REQUESTED_CORRECTION",
      reasonDetails: "Incorrect operating duration.",
    });
    expect(corrected).toMatchObject({ success: true, disposition: "ACCEPTED" });
    const linkage = owner(`
      SELECT jsonb_build_object(
        'status',status,
        'sourceRevisionId',source_revision_id,
        'resultingRevisionId',resulting_revision_id,
        'resolvedAtPresent',resolved_at IS NOT NULL
      )
      FROM erp.customer_correction_requests
      WHERE company_id='${tenant}' AND source_revision_id='${deurIds[1]}';
    `);
    expect(linkage).toContain('"status": "Resolved"');
    expect(linkage).toContain(`"resultingRevisionId": "${corrected.value.revisionId}"`);
    expect(linkage).toContain('"resolvedAtPresent": true');
  }, 30_000);

  it("returns safe typed outcomes for expired, revoked, superseded, and swapped payloads", async () => {
    const expired = await issue(deurIds[2]);
    const revoked = await issue(deurIds[3]);
    const superseded = await issue(deurIds[4]);
    owner(`
      UPDATE erp.customer_review_requests SET expires_at=clock_timestamp()-interval '1 second'
        WHERE company_id='${tenant}' AND revision_id='${deurIds[2]}';
      UPDATE erp.customer_review_requests SET status='Revoked',revoked_at=clock_timestamp()
        WHERE company_id='${tenant}' AND revision_id='${deurIds[3]}';
      UPDATE erp.customer_review_requests SET status='Superseded',superseded_at=clock_timestamp(),revoked_at=clock_timestamp()
        WHERE company_id='${tenant}' AND revision_id='${deurIds[4]}';
    `);
    expect(await rpc(anonymousA, "public_acknowledge_customer_review", command("C5A-EXPIRED", expired)))
      .toMatchObject({ success: false, code: "EXPIRED" });
    expect(await rpc(anonymousA, "public_acknowledge_customer_review", command("C5A-REVOKED", revoked)))
      .toMatchObject({ success: false, code: "INVALID_OR_UNAVAILABLE" });
    expect(await rpc(anonymousA, "public_acknowledge_customer_review", command("C5A-SUPERSEDED", superseded)))
      .toMatchObject({ success: false, code: "SUPERSEDED" });
    expect(await rpc(anonymousA, "get_public_customer_review", { token: expired, revisionId: deurIds[0] }))
      .toMatchObject({ success: false, code: "INVALID_OR_UNAVAILABLE" });
  });

  it("serializes all four genuine independent public-request races", async () => {
    const race = async (
      deurId: string,
      actionA: "ack" | "correction",
      actionB: "ack" | "correction",
      reasonA?: string,
      reasonB?: string,
      sharedKey = true,
    ) => {
      const token = await issue(deurId);
      const keyA = `RACE-${deurId}`;
      const keyB = sharedKey ? keyA : `${keyA}-B`;
      return executeParallelCommandRace({
        clientA: anonymousA,
        clientB: anonymousB,
        rpcA: actionA === "ack" ? "public_acknowledge_customer_review" : "public_request_customer_correction",
        rpcB: actionB === "ack" ? "public_acknowledge_customer_review" : "public_request_customer_correction",
        commandA: { token, commandId: randomUUID(), idempotencyKey: keyA, ...(reasonA ? { reason: reasonA } : {}) },
        commandB: { token, commandId: randomUUID(), idempotencyKey: keyB, ...(reasonB ? { reason: reasonB } : {}) },
      });
    };
    const duplicateAck = await race(deurIds[5], "ack", "ack");
    const duplicateAckResponses = [duplicateAck.a.data, duplicateAck.b.data] as any[];
    expect(duplicateAck.deadlock).toBe(false);
    expect(duplicateAck.overlapped).toBe(true);
    expect(duplicateAckResponses.filter((item) => item?.success)).toHaveLength(2);
    expect(duplicateAckResponses.map((item) => item?.disposition).sort()).toEqual(["ACCEPTED", "REPLAYED"]);

    const incompatible = await race(deurIds[6], "ack", "correction", undefined, "Incorrect project allocation.", false);
    const incompatibleResponses = [incompatible.a.data, incompatible.b.data] as any[];
    expect(incompatible.deadlock).toBe(false);
    expect(incompatibleResponses.filter((item) => item?.success)).toHaveLength(1);
    expect(incompatibleResponses.filter((item) => !item?.success)).toHaveLength(1);

    const duplicateCorrection = await race(
      deurIds[7], "correction", "correction",
      "Incorrect meter reading.", "Incorrect meter reading.",
    );
    const duplicateCorrectionResponses = [duplicateCorrection.a.data, duplicateCorrection.b.data] as any[];
    expect(duplicateCorrection.deadlock).toBe(false);
    expect(duplicateCorrectionResponses.map((item) => item?.disposition).sort()).toEqual(["ACCEPTED", "REPLAYED"]);

    const competingReasons = await race(
      deurIds[8], "correction", "correction",
      "Incorrect opening meter.", "Incorrect closing meter.", true,
    );
    const competingReasonResponses = [competingReasons.a.data, competingReasons.b.data] as any[];
    expect(competingReasons.deadlock).toBe(false);
    expect(competingReasonResponses.filter((item) => item?.success)).toHaveLength(1);
    expect(competingReasonResponses.some((item) => item?.code === "IDEMPOTENCY_MISMATCH")).toBe(true);

    const integrity = owner(`
      SELECT jsonb_build_object(
        'raceOutcomes',(SELECT count(*) FROM erp.customer_review_outcomes WHERE company_id='${tenant}' AND revision_id IN('${deurIds[5]}','${deurIds[6]}','${deurIds[7]}','${deurIds[8]}')),
        'duplicateRequests',(SELECT count(*) FROM (
          SELECT review_request_id FROM erp.customer_review_outcomes WHERE company_id='${tenant}'
          GROUP BY review_request_id HAVING count(*)>1
        ) duplicates),
        'duplicateWorkItems',(SELECT count(*) FROM (
          SELECT review_request_id FROM erp.customer_correction_requests WHERE company_id='${tenant}'
          GROUP BY review_request_id HAVING count(*)>1
        ) duplicates)
      );
    `);
    expect(integrity).toContain('"raceOutcomes": 4');
    expect(integrity).toContain('"duplicateRequests": 0');
    expect(integrity).toContain('"duplicateWorkItems": 0');
  }, 60_000);

  it("certifies the complete delivered customer R1-to-R2 correction lifecycle and outcome readback", async () => {
    const notificationConfiguration = parseNotificationServerConfiguration(process.env);
    const r1Issued = await rpc(operations, "trusted_issue_customer_review", {
      commandId: `C5C2-R1-${randomUUID()}`,
      idempotencyKey: `C5C2-R1-${randomUUID()}`,
      deurId: deurIds[10],
      rentalLineId: "UAT-C5A-LINE",
      revisionId: deurIds[10],
    });
    expect(r1Issued).toMatchObject({ success: true, disposition: "ACCEPTED" });
    const r1Path = r1Issued.value.notification.reviewPath as string;
    const r1Token = r1Path.slice("/review/deur/".length);
    const r1IntentId = r1Issued.value.notificationIntentId as string;
    expect(await rpc(anonymousA, "get_public_customer_review", { token: r1Token }))
      .toMatchObject({ success: true, disposition: "AVAILABLE" });
    const r1Delivery = await deliverAndReadback(r1IntentId, r1Path);
    expect(r1Delivery.intent.type).toBe("CUSTOMER_REVIEW_REQUESTED");
    expect(r1Delivery.body).toContain("R1");

    const browser = await chromium.launch({ headless: true });
    try {
      const context = await browser.newContext();
      const page = await context.newPage();
      const browserErrors: string[] = [];
      const allowedOrigins = [
        new URL(notificationConfiguration.publicBaseUrl).origin,
        new URL(configuration.url!).origin,
      ];
      const unexpectedOrigins = new Set<string>();
      page.on("pageerror", (error) => browserErrors.push(error.message));
      page.on("console", (message) => {
        if (message.type() === "error") browserErrors.push(message.text());
      });
      page.on("request", (request) => {
        const origin = new URL(request.url()).origin;
        if (!allowedOrigins.includes(origin)) unexpectedOrigins.add(origin);
      });
      page.on("dialog", (dialog) => void dialog.accept());
      await page.goto(r1Delivery.reviewUrl!, { waitUntil: "domcontentloaded", timeout: 15_000 });
      await playwrightExpect(page.getByText("UAT-C5A-RENTAL")).toBeVisible({ timeout: 15_000 });
      await playwrightExpect(page.getByText(/\sR1$/)).toBeVisible();
      await page.locator("#correction-reason").fill("Correct the operating duration for this shift.");
      const [correctionResponse] = await Promise.all([
        page.waitForResponse((response) =>
          new URL(response.url()).pathname.endsWith("/rpc/public_request_customer_correction")),
        page.getByRole("button", { name: "Request Correction" }).click(),
      ]);
      const correctionResult = await correctionResponse.json() as {
        success?: boolean; disposition?: string; code?: string;
      };
      expect({
        status: correctionResponse.status(),
        success: correctionResult.success,
        disposition: correctionResult.disposition,
        code: correctionResult.code,
      }).toMatchObject({ status: 200, success: true, disposition: "ACCEPTED" });
      await playwrightExpect(page.getByRole("heading", { name: "Review complete" }))
        .toBeVisible({ timeout: 15_000 });
      expect(page.url()).toBe(
        `${notificationConfiguration.publicBaseUrl.replace(/\/$/, "")}/review/deur/completed`,
      );
      expect(browserErrors).toEqual([]);
      expect([...unexpectedOrigins]).toEqual([]);
      await context.close();
    } finally {
      await browser.close();
    }

    const r1State = ownerValue(`
      SELECT jsonb_build_object(
        'outcomeIntent',(SELECT id FROM erp.notification_outbox
          WHERE company_id='${tenant}' AND notification_type='CUSTOMER_CORRECTION_CONFIRMED'
          AND review_request_id=(SELECT id FROM erp.customer_review_requests
            WHERE company_id='${tenant}' AND revision_id='${deurIds[10]}') ORDER BY created_at DESC LIMIT 1),
        'workIntent',(SELECT id FROM erp.notification_outbox
          WHERE company_id='${tenant}' AND notification_type='CUSTOMER_CORRECTION_WORK_ITEM'
          AND review_request_id=(SELECT id FROM erp.customer_review_requests
            WHERE company_id='${tenant}' AND revision_id='${deurIds[10]}') ORDER BY created_at DESC LIMIT 1),
        'outcomes',(SELECT count(*) FROM erp.customer_review_outcomes
          WHERE company_id='${tenant}' AND revision_id='${deurIds[10]}' AND action='REQUEST_CORRECTION'),
        'workItems',(SELECT count(*) FROM erp.customer_correction_requests
          WHERE company_id='${tenant}' AND source_revision_id='${deurIds[10]}')
      );
    `);
    expect(r1State.outcomes).toBe(1);
    expect(r1State.workItems).toBe(1);
    expect(r1State.outcomeIntent).toBeTruthy();
    expect(r1State.workIntent).toBeTruthy();
    const correctionOutcome = await deliverAndReadback(r1State.outcomeIntent);
    const correctionWorkItem = await deliverAndReadback(r1State.workIntent);
    expect(correctionOutcome.intent.type).toBe("CUSTOMER_CORRECTION_CONFIRMED");
    expect(correctionWorkItem.intent.type).toBe("CUSTOMER_CORRECTION_WORK_ITEM");

    const source = await operations.schema("erp").from("deurs")
      .select("row_version").eq("id", deurIds[10]).single();
    expect(source.error).toBeNull();
    const corrected = await rpc(operations, "command_create_deur_correction", {
      commandId: `C5C2-CREATE-R2-${randomUUID()}`,
      idempotencyKey: `C5C2-CREATE-R2-${randomUUID()}`,
      sourceRevisionId: deurIds[10],
      expectedVersion: source.data!.row_version,
      reasonCode: "CUSTOMER_REQUESTED_CORRECTION",
      reasonDetails: "Correct the operating duration for this shift.",
    });
    expect(corrected).toMatchObject({ success: true, disposition: "ACCEPTED" });
    const r2Id = corrected.value.revisionId as string;
    const r2Version = await operations.schema("erp").from("deurs")
      .select("row_version").eq("id", r2Id).single();
    expect(r2Version.error).toBeNull();
    const applied = await rpc(operations, "command_apply_deur_correction", {
      commandId: `C5C2-APPLY-R2-${randomUUID()}`,
      idempotencyKey: `C5C2-APPLY-R2-${randomUUID()}`,
      revisionId: r2Id,
      expectedVersion: r2Version.data!.row_version,
      patch: {
        events: [
          { sequence: 1, activityType: "shift", action: "start", timestamp: "2026-08-11T08:00:00Z" },
          { sequence: 2, activityType: "operation", action: "start", timestamp: "2026-08-11T08:00:00Z" },
          { sequence: 3, activityType: "operation", action: "end", timestamp: "2026-08-11T13:30:00Z" },
          { sequence: 4, activityType: "shift", action: "end", timestamp: "2026-08-11T13:30:00Z" },
        ],
        openingMeter: 100,
        closingMeter: 109,
        reason: "Corrected customer-confirmed operating duration.",
      },
    });
    expect(applied).toMatchObject({ success: true, disposition: "ACCEPTED" });
    const appliedVersion = await operations.schema("erp").from("deurs")
      .select("row_version").eq("id", r2Id).single();
    expect(appliedVersion.error).toBeNull();
    const submitted = await rpc(operations, "command_submit_deur", {
      commandId: `C5C2-SUBMIT-R2-${randomUUID()}`,
      idempotencyKey: `C5C2-SUBMIT-R2-${randomUUID()}`,
      rentalId: "UAT-C5A-RENTAL",
      rentalLineId: "UAT-C5A-LINE",
      assignmentId: "UAT-C5A-ASG",
      equipmentId: "UAT-C5A-EQ",
      operatorId: "UAT-C5A-OP",
      deurId: r2Id,
      expectedVersion: appliedVersion.data!.row_version,
    });
    expect(submitted).toMatchObject({ success: true, disposition: "ACCEPTED" });
    const r2Issued = await rpc(operations, "trusted_issue_customer_review", {
      commandId: `C5C2-ISSUE-R2-${randomUUID()}`,
      idempotencyKey: `C5C2-ISSUE-R2-${randomUUID()}`,
      deurId: r2Id,
      rentalLineId: "UAT-C5A-LINE",
      revisionId: r2Id,
    });
    expect(r2Issued).toMatchObject({ success: true, disposition: "ACCEPTED" });
    const r2Path = r2Issued.value.notification.reviewPath as string;
    const r2Token = r2Path.slice("/review/deur/".length);
    expect(await rpc(anonymousA, "get_public_customer_review", { token: r1Token }))
      .toMatchObject({ success: true, disposition: "ALREADY_COMPLETED" });
    const immutableEvidence = ownerValue(`
      SELECT jsonb_build_object(
        'r1Revision',(SELECT revision_number FROM erp.deurs WHERE id='${deurIds[10]}'),
        'r1Events',(SELECT count(*) FROM erp.deur_events WHERE deur_id='${deurIds[10]}'),
        'r2Revision',(SELECT revision_number FROM erp.deurs WHERE id='${r2Id}'),
        'r2Previous',(SELECT previous_revision_id FROM erp.deurs WHERE id='${r2Id}'),
        'workStatus',(SELECT status FROM erp.customer_correction_requests
          WHERE company_id='${tenant}' AND source_revision_id='${deurIds[10]}')
      );
    `);
    expect(immutableEvidence).toMatchObject({
      r1Revision: 1,
      r1Events: 4,
      r2Revision: 2,
      r2Previous: deurIds[10],
      workStatus: "Resolved",
    });
    const r2Delivery = await deliverAndReadback(
      r2Issued.value.notificationIntentId as string,
      r2Path,
    );
    expect(r2Delivery.intent.type).toBe("CUSTOMER_CORRECTED_REVIEW_REQUESTED");
    expect(r2Delivery.body).toContain("R2");

    const r2Browser = await chromium.launch({ headless: true });
    try {
      const context = await r2Browser.newContext();
      const page = await context.newPage();
      page.on("dialog", (dialog) => void dialog.accept());
      await page.goto(r2Delivery.reviewUrl!, { waitUntil: "domcontentloaded", timeout: 15_000 });
      await playwrightExpect(page.getByText(/\sR2$/)).toBeVisible({ timeout: 15_000 });
      const [acknowledgeResponse] = await Promise.all([
        page.waitForResponse((response) =>
          new URL(response.url()).pathname.endsWith("/rpc/public_acknowledge_customer_review")),
        page.getByRole("button", { name: "Acknowledge" }).click(),
      ]);
      const acknowledgeResult = await acknowledgeResponse.json() as {
        success?: boolean; disposition?: string; code?: string;
      };
      expect({
        status: acknowledgeResponse.status(),
        success: acknowledgeResult.success,
        disposition: acknowledgeResult.disposition,
        code: acknowledgeResult.code,
      }).toMatchObject({ status: 200, success: true, disposition: "ACCEPTED" });
      await playwrightExpect(page.getByRole("heading", { name: "Review complete" }))
        .toBeVisible({ timeout: 15_000 });
      expect(page.url()).toBe(
        `${notificationConfiguration.publicBaseUrl.replace(/\/$/, "")}/review/deur/completed`,
      );
      const persisted = await page.evaluate(async (credential) => ({
        local: JSON.stringify(localStorage).includes(credential),
        session: JSON.stringify(sessionStorage).includes(credential),
        cookies: document.cookie.includes(credential),
        indexedDbNames: (indexedDB.databases ? await indexedDB.databases() : [])
          .some((database) => database.name?.includes(credential)),
        cacheNames: ("caches" in window ? await caches.keys() : [])
          .some((name) => name.includes(credential)),
      }), r2Token);
      expect(persisted).toEqual({
        local: false, session: false, cookies: false, indexedDbNames: false, cacheNames: false,
      });
      await page.reload({ waitUntil: "domcontentloaded", timeout: 15_000 });
      await playwrightExpect(page.getByRole("heading", { name: "Review complete" })).toBeVisible();
      await page.goto(r2Delivery.reviewUrl!, { waitUntil: "domcontentloaded", timeout: 15_000 });
      await playwrightExpect(page.getByRole("heading", { name: "Review unavailable" })).toBeVisible();
      await context.close();
    } finally {
      await r2Browser.close();
    }
    expect(await rpc(anonymousA, "get_public_customer_review", { token: r2Token }))
      .toMatchObject({ success: true, disposition: "ALREADY_COMPLETED" });
    const r2Outcome = ownerValue(`
      SELECT jsonb_build_object('intentId',(SELECT id FROM erp.notification_outbox
        WHERE company_id='${tenant}' AND notification_type='CUSTOMER_ACKNOWLEDGED'
        AND review_request_id=(SELECT id FROM erp.customer_review_requests
          WHERE company_id='${tenant}' AND revision_id='${r2Id}') ORDER BY created_at DESC LIMIT 1));
    `);
    expect(r2Outcome.intentId).toBeTruthy();
    const acknowledgement = await deliverAndReadback(r2Outcome.intentId);
    expect(acknowledgement.intent.type).toBe("CUSTOMER_ACKNOWLEDGED");
  }, 180_000);

  it("certifies remote send-versus-supersede, issuance replay, and changed-payload races", async () => {
    const fakeSend = async (intentId: string, idempotencyKey: string) => {
      const provider = new FakeEmailDeliveryProvider("success");
      const delivery = await provider.send({
        from: "controlled@example.invalid",
        to: "controlled@example.invalid",
        recipientName: "Controlled UAT Recipient",
        email: { subject: "Controlled race", text: "No credential", html: "<p>No credential</p>" },
        idempotencyKey,
      });
      expect(delivery.accepted).toBe(true);
      return { provider, intentId };
    };

    const initial = await rpc(operations, "trusted_issue_customer_review", {
      commandId: `RACE-A-INITIAL-${randomUUID()}`,
      idempotencyKey: `RACE-A-INITIAL-${randomUUID()}`,
      deurId: deurIds[11],
      rentalLineId: "UAT-C5A-LINE",
      revisionId: deurIds[11],
    });
    const oldIntentId = initial.value.notificationIntentId as string;
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const workerId = randomUUID();
    const claimTask = (async () => {
      await gate;
      const startedAt = performance.now();
      const response = await harness!.admin.schema("erp").rpc("claim_notification_delivery", {
        notification_id: oldIntentId,
        worker_id: workerId,
      });
      return { startedAt, finishedAt: performance.now(), response };
    })();
    const supersedeTask = (async () => {
      await gate;
      const startedAt = performance.now();
      const response = await operationsB.schema("erp").rpc("trusted_issue_customer_review", {
        command: {
          commandId: `RACE-A-SUPERSEDE-${randomUUID()}`,
          idempotencyKey: `RACE-A-SUPERSEDE-${randomUUID()}`,
          deurId: deurIds[11],
          rentalLineId: "UAT-C5A-LINE",
          revisionId: deurIds[11],
        },
      });
      return { startedAt, finishedAt: performance.now(), response };
    })();
    await Promise.resolve();
    release();
    const [claimRace, supersedeRace] = await Promise.all([claimTask, supersedeTask]);
    expect(claimRace.response.error).toBeNull();
    expect(supersedeRace.response.error).toBeNull();
    expect(supersedeRace.response.data).toMatchObject({ success: true, disposition: "ACCEPTED" });
    const raceAOverlap = Math.max(claimRace.startedAt, supersedeRace.startedAt)
      <= Math.min(claimRace.finishedAt, supersedeRace.finishedAt);
    expect(raceAOverlap).toBe(true);
    const raceAProvider = new FakeEmailDeliveryProvider("success");
    if ((claimRace.response.data as any)?.success) {
      await raceAProvider.send({
        from: "controlled@example.invalid", to: "controlled@example.invalid",
        recipientName: "Controlled UAT Recipient",
        email: { subject: "Controlled race", text: "No credential", html: "<p>No credential</p>" },
        idempotencyKey: "RACE-A-PROVIDER",
      });
      const complete = await harness!.admin.schema("erp").rpc("complete_notification_delivery", {
        command: {
          id: oldIntentId, workerId, status: "ProviderAccepted",
          providerName: "fake", providerMessageId: "RACE-A-CONTROLLED",
        },
      });
      expect(complete.error).toBeNull();
      expect(complete.data).toMatchObject({ success: true });
    }
    expect(raceAProvider.evidence().callCount).toBeLessThanOrEqual(1);
    const raceAFinal = ownerValue(`
      SELECT jsonb_build_object(
        'oldReview',(SELECT r.status FROM erp.customer_review_requests r
          JOIN erp.notification_outbox n ON n.review_request_id=r.id WHERE n.id='${oldIntentId}'),
        'oldIntent',(SELECT status FROM erp.notification_outbox WHERE id='${oldIntentId}'),
        'attempts',(SELECT count(*) FROM erp.notification_delivery_attempts
          WHERE notification_id='${oldIntentId}')
      );
    `);
    expect(raceAFinal.oldReview).toBe("Superseded");
    expect(["Superseded", "ProviderAccepted"]).toContain(raceAFinal.oldIntent);
    expect(raceAFinal.attempts).toBeLessThanOrEqual(1);

    const replayKey = `RACE-C-${randomUUID()}`;
    const replayCommand = {
      commandId: replayKey,
      idempotencyKey: replayKey,
      deurId: deurIds[12],
      rentalLineId: "UAT-C5A-LINE",
      revisionId: deurIds[12],
    };
    const replayRace = await executeParallelCommandRace({
      clientA: operations,
      clientB: operationsB,
      rpcA: "trusted_issue_customer_review",
      commandA: replayCommand,
      commandB: replayCommand,
    });
    expect(replayRace.overlapped).toBe(true);
    expect(replayRace.deadlock).toBe(false);
    expect(replayRace.a.error).toBeNull();
    expect(replayRace.b.error).toBeNull();
    const replayResponses = [replayRace.a.data, replayRace.b.data] as any[];
    expect(replayResponses.map((value) => value?.disposition).sort())
      .toEqual(["ACCEPTED", "REPLAYED"]);
    const replayState = ownerValue(`
      SELECT jsonb_build_object(
        'requests',(SELECT count(*) FROM erp.customer_review_requests
          WHERE company_id='${tenant}' AND revision_id='${deurIds[12]}'),
        'intents',(SELECT count(*) FROM erp.notification_outbox
          WHERE company_id='${tenant}' AND notification_type='CUSTOMER_REVIEW_REQUESTED'
          AND review_request_id IN(SELECT id FROM erp.customer_review_requests
            WHERE company_id='${tenant}' AND revision_id='${deurIds[12]}')),
        'intentId',(SELECT id FROM erp.notification_outbox
          WHERE company_id='${tenant}' AND notification_type='CUSTOMER_REVIEW_REQUESTED'
          AND review_request_id IN(SELECT id FROM erp.customer_review_requests
            WHERE company_id='${tenant}' AND revision_id='${deurIds[12]}') LIMIT 1)
      );
    `);
    expect(replayState.requests).toBe(1);
    expect(replayState.intents).toBe(1);
    const replayClaimWorker = randomUUID();
    const replayClaim = await harness!.admin.schema("erp").rpc("claim_notification_delivery", {
      notification_id: replayState.intentId,
      worker_id: replayClaimWorker,
    });
    expect(replayClaim.data).toMatchObject({ success: true });
    const replayProvider = await fakeSend(replayState.intentId, replayKey);
    expect(replayProvider.provider.evidence().callCount).toBe(1);

    const mismatchKey = `RACE-D-${randomUUID()}`;
    const mismatchRace = await executeParallelCommandRace({
      clientA: operations,
      clientB: operationsB,
      rpcA: "trusted_issue_customer_review",
      commandA: {
        commandId: `${mismatchKey}-A`, idempotencyKey: mismatchKey,
        deurId: deurIds[13], rentalLineId: "UAT-C5A-LINE", revisionId: deurIds[13],
      },
      commandB: {
        commandId: `${mismatchKey}-B`, idempotencyKey: mismatchKey,
        deurId: deurIds[14], rentalLineId: "UAT-C5A-LINE", revisionId: deurIds[14],
      },
    });
    expect(mismatchRace.overlapped).toBe(true);
    expect(mismatchRace.deadlock).toBe(false);
    expect(mismatchRace.a.error).toBeNull();
    expect(mismatchRace.b.error).toBeNull();
    const mismatchResponses = [mismatchRace.a.data, mismatchRace.b.data] as any[];
    expect(mismatchResponses.filter((value) => value?.success && value?.disposition === "ACCEPTED"))
      .toHaveLength(1);
    expect(mismatchResponses.filter((value) => value?.code === "IDEMPOTENCY_MISMATCH"))
      .toHaveLength(1);
    const mismatchState = ownerValue(`
      SELECT jsonb_build_object(
        'requests',(SELECT count(*) FROM erp.customer_review_requests
          WHERE company_id='${tenant}' AND revision_id IN('${deurIds[13]}','${deurIds[14]}')),
        'intents',(SELECT count(*) FROM erp.notification_outbox
          WHERE company_id='${tenant}' AND notification_type='CUSTOMER_REVIEW_REQUESTED'
          AND review_request_id IN(SELECT id FROM erp.customer_review_requests
            WHERE company_id='${tenant}' AND revision_id IN('${deurIds[13]}','${deurIds[14]}'))),
        'winningRevision',(SELECT revision_id FROM erp.customer_review_requests
          WHERE company_id='${tenant}' AND revision_id IN('${deurIds[13]}','${deurIds[14]}') LIMIT 1),
        'intentId',(SELECT n.id FROM erp.notification_outbox n JOIN erp.customer_review_requests r
          ON r.id=n.review_request_id WHERE n.company_id='${tenant}'
          AND r.revision_id IN('${deurIds[13]}','${deurIds[14]}') LIMIT 1)
      );
    `);
    expect(mismatchState.requests).toBe(1);
    expect(mismatchState.intents).toBe(1);
    expect([deurIds[13], deurIds[14]]).toContain(mismatchState.winningRevision);
    const mismatchClaim = await harness!.admin.schema("erp").rpc("claim_notification_delivery", {
      notification_id: mismatchState.intentId,
      worker_id: randomUUID(),
    });
    expect(mismatchClaim.data).toMatchObject({ success: true });
    const mismatchProvider = await fakeSend(mismatchState.intentId, mismatchKey);
    expect(mismatchProvider.provider.evidence().callCount).toBe(1);
    console.info(JSON.stringify({
      raceA: {
        remoteDb: true, provider: "controlled", overlap: raceAOverlap,
        winner: raceAFinal.oldIntent, loser: raceAFinal.oldReview,
        providerCalls: raceAProvider.evidence().callCount, deadlock: false,
      },
      raceC: {
        remoteDb: true, provider: "controlled", overlap: replayRace.overlapped,
        winner: "ACCEPTED", loser: "REPLAYED", providerCalls: 1, deadlock: replayRace.deadlock,
      },
      raceD: {
        remoteDb: true, provider: "controlled", overlap: mismatchRace.overlapped,
        winner: "ACCEPTED", loser: "IDEMPOTENCY_MISMATCH",
        providerCalls: 1, deadlock: mismatchRace.deadlock,
      },
    }));
  }, 120_000);

  it("certifies FailedCredentialLost controlled reissuance and replacement delivery", async () => {
    const originalIssued = await operations.schema("erp").rpc("trusted_issue_customer_review", {
      command: {
        commandId: `C5C2-ORIGINAL-${randomUUID()}`,
        idempotencyKey: `C5C2-ORIGINAL-${randomUUID()}`,
        deurId: deurIds[9], rentalLineId: "UAT-C5A-LINE", revisionId: deurIds[9],
      },
    });
    expect(originalIssued.error).toBeNull();
    expect(originalIssued.data).toMatchObject({ success: true, disposition: "ACCEPTED" });
    const originalPath = originalIssued.data.value.notification.reviewPath as string;
    const originalToken = originalPath.slice("/review/deur/".length);
    const originalIntentId = originalIssued.data.value.notificationIntentId as string;
    const originalIntentResult = await harness!.admin.schema("erp").rpc(
      "get_notification_delivery_intent", { notification_id: originalIntentId },
    );
    expect(originalIntentResult.error).toBeNull();
    expect(originalIntentResult.data).toMatchObject({ success: true });
    const originalIntent = originalIntentResult.data.value;
    const originalRequestId = originalIntent.reviewRequestId as string;

    const failedWorker = randomUUID();
    const claim = await harness!.admin.schema("erp").rpc("claim_notification_delivery", {
      notification_id: originalIntentId, worker_id: failedWorker,
    });
    expect(claim.error).toBeNull();
    expect(claim.data).toMatchObject({ success: true });
    const failedProvider = new FakeEmailDeliveryProvider("invalid-recipient");
    const failedDelivery = await failedProvider.send({
      from: "controlled@example.invalid", to: "controlled@example.invalid",
      recipientName: "Controlled UAT Recipient",
      email: { subject: "Controlled failure", text: "No credential", html: "<p>No credential</p>" },
      idempotencyKey: originalIntent.idempotencyKey,
    });
    expect(failedDelivery).toMatchObject({ accepted: false, category: "InvalidRecipient" });
    const failedCompletion = await harness!.admin.schema("erp").rpc("complete_notification_delivery", {
      command: {
        id: originalIntentId, workerId: failedWorker,
        status: "FailedCredentialLost", failureCategory: "InvalidRecipient",
      },
    });
    expect(failedCompletion.error).toBeNull();
    expect(failedCompletion.data).toMatchObject({ success: true });
    const ordinaryRetry = await harness!.admin.schema("erp").rpc("claim_notification_delivery", {
      notification_id: originalIntentId, worker_id: randomUUID(),
    });
    expect(ordinaryRetry.data).toMatchObject({ success: false, code: "NOT_CLAIMED" });

    const replacementCommand = {
      commandId: `C5C2-REISSUE-${randomUUID()}`,
      idempotencyKey: `C5C2-REISSUE-${randomUUID()}`,
      deurId: deurIds[9], rentalLineId: "UAT-C5A-LINE", revisionId: deurIds[9],
    };
    const reissued = await operations.schema("erp").rpc("trusted_reissue_review_notification", {
      review_kind: "customer", old_request_id: originalRequestId,
      reason: "Controlled isolated-UAT recovery after definitive pre-acceptance failure.",
      command: replacementCommand,
    });
    expect(reissued.error).toBeNull();
    expect(reissued.data).toMatchObject({ success: true, disposition: "ACCEPTED" });
    const replacementPath = reissued.data.value.notification.reviewPath as string;
    const replacementToken = replacementPath.slice("/review/deur/".length);
    const replacementIntentId = reissued.data.value.notificationIntentId as string;
    expect(replacementToken).not.toBe(originalToken);
    expect(await rpc(anonymousA, "get_public_customer_review", { token: originalToken }))
      .toMatchObject({ success: false, code: "SUPERSEDED" });
    expect(await rpc(anonymousA, "get_public_customer_review", { token: replacementToken }))
      .toMatchObject({ success: true, disposition: "AVAILABLE" });

    const intentResult = await harness!.admin.schema("erp").rpc("get_notification_delivery_intent", {
      notification_id: replacementIntentId,
    });
    expect(intentResult.error).toBeNull();
    const intent = intentResult.data.value;
    const replacementWorker = randomUUID();
    const replacementClaim = await harness!.admin.schema("erp").rpc("claim_notification_delivery", {
      notification_id: replacementIntentId, worker_id: replacementWorker,
    });
    expect(replacementClaim.data).toMatchObject({ success: true });
    const notificationConfiguration = parseNotificationServerConfiguration(process.env);
    const browserOrigin = process.env.PUBLIC_REVIEW_BROWSER_ORIGIN?.trim()
      || notificationConfiguration.publicBaseUrl;
    const readbackApiKey = process.env.RESEND_READBACK_API_KEY?.trim();
    if (!readbackApiKey) throw new Error(
      "Missing required server-only provider configuration: RESEND_READBACK_API_KEY",
    );
    const replacementProvider = new ResendEmailDeliveryProvider({
      apiKey: notificationConfiguration.resendApiKey,
      uatRecipientOverride: notificationConfiguration.uatRecipientOverride,
      timeoutMs: 15_000,
    });
    const reviewUrl = new URL(replacementPath, notificationConfiguration.publicBaseUrl).toString();
    const browserReviewUrl = new URL(replacementPath, browserOrigin).toString();
    const delivered = await replacementProvider.send({
      from: notificationConfiguration.fromAddress, to: intent.recipient.destination,
      recipientName: intent.recipient.displayName,
      email: renderNotificationTemplate(intent.type, { ...intent.input, reviewUrl }),
      idempotencyKey: intent.idempotencyKey,
    });
    expect(delivered.accepted).toBe(true);
    if (!delivered.accepted) throw new Error("Replacement provider delivery was not accepted.");
    const replacementCompletion = await harness!.admin.schema("erp").rpc("complete_notification_delivery", {
      command: {
        id: replacementIntentId, workerId: replacementWorker, status: "ProviderAccepted",
        providerName: delivered.provider, providerMessageId: delivered.providerMessageId,
      },
    });
    expect(replacementCompletion.data).toMatchObject({ success: true });

    let providerEvent = "";
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const response = await fetch(`https://api.resend.com/emails/${delivered.providerMessageId}`, {
        headers: { Authorization: `Bearer ${readbackApiKey}` },
      });
      expect(response.ok).toBe(true);
      const message = await response.json() as {
        to?: string[]; from?: string; subject?: string; html?: string; text?: string; last_event?: string;
      };
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
    const context = await browser.newContext();
    const page = await context.newPage();
    const consoleErrors: string[] = [];
    const externalOrigins = new Set<string>();
    page.on("pageerror", (error) => consoleErrors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error") consoleErrors.push(message.text());
    });
    page.on("request", (request) => {
      const requestOrigin = new URL(request.url()).origin;
      if (![
        new URL(browserOrigin).origin,
        new URL(configuration.url!).origin,
      ].includes(requestOrigin)) externalOrigins.add(requestOrigin);
    });
    page.on("dialog", (dialog) => void dialog.accept());
    await page.goto(browserReviewUrl, { waitUntil: "domcontentloaded", timeout: 15_000 });
    await playwrightExpect(page.getByText("UAT-C5A-RENTAL")).toBeVisible({ timeout: 15_000 });
    await playwrightExpect(page.getByText(deurIds[9])).toBeVisible();
    await playwrightExpect(page.getByRole("button", { name: "Acknowledge" })).toBeVisible();
    await playwrightExpect(page.getByRole("button", { name: "Request Correction" })).toBeVisible();
    await playwrightExpect(page.getByRole("button", { name: "Reject" })).toHaveCount(0);
    expect(await page.locator("meta[name=referrer]").getAttribute("content")).toBe("no-referrer");
    const [acknowledgeResponse] = await Promise.all([
      page.waitForResponse((response) =>
        new URL(response.url()).pathname.endsWith("/rpc/public_acknowledge_customer_review")),
      page.getByRole("button", { name: "Acknowledge" }).click(),
    ]);
    const acknowledgeResult = await acknowledgeResponse.json() as {
      success?: boolean; disposition?: string; code?: string;
    };
    expect({
      status: acknowledgeResponse.status(),
      success: acknowledgeResult.success,
      disposition: acknowledgeResult.disposition,
      code: acknowledgeResult.code,
    }).toMatchObject({ status: 200, success: true, disposition: "ACCEPTED" });
    await playwrightExpect(page.getByRole("heading", { name: "Review complete" }))
      .toBeVisible({ timeout: 15_000 });
    expect(page.url()).toBe(`${browserOrigin.replace(/\/$/, "")}/review/deur/completed`);
    const persisted = await page.evaluate(async (credential) => ({
      local: JSON.stringify(localStorage).includes(credential),
      session: JSON.stringify(sessionStorage).includes(credential),
      cookies: document.cookie.includes(credential),
      indexedDbNames: (indexedDB.databases ? await indexedDB.databases() : [])
        .some((database) => database.name?.includes(credential)),
      cacheNames: ("caches" in window ? await caches.keys() : [])
        .some((name) => name.includes(credential)),
    }), replacementToken);
    expect(persisted).toEqual({
      local: false, session: false, cookies: false, indexedDbNames: false, cacheNames: false,
    });
    await page.reload({ waitUntil: "domcontentloaded", timeout: 15_000 });
    await playwrightExpect(page.getByRole("heading", { name: "Review complete" })).toBeVisible();
    await page.goto(browserReviewUrl, { waitUntil: "domcontentloaded", timeout: 15_000 });
    await playwrightExpect(page.getByRole("heading", { name: "Review unavailable" })).toBeVisible();
    expect(consoleErrors).toEqual([]);
    expect([...externalOrigins]).toEqual([]);
    await context.close();
    await browser.close();
    expect(await rpc(anonymousA, "get_public_customer_review", { token: replacementToken }))
      .toMatchObject({ success: true, disposition: "ALREADY_COMPLETED" });
    const evidence = owner(`
      SELECT jsonb_build_object(
        'oldSuperseded',(SELECT status='Superseded' FROM erp.customer_review_requests WHERE id='${originalRequestId}'),
        'oldAttemptStatus',(SELECT status FROM erp.notification_delivery_attempts WHERE notification_id='${originalIntentId}'),
        'newAccepted',(SELECT status='ProviderAccepted' AND provider_message_id IS NOT NULL FROM erp.notification_outbox WHERE id='${replacementIntentId}'),
        'audit',(SELECT count(*) FROM erp.audit_log WHERE company_id='${tenant}' AND action='CONTROLLED_REISSUE'),
        'requests',(SELECT count(*) FROM erp.customer_review_requests WHERE company_id='${tenant}' AND revision_id='${deurIds[9]}'),
        'outcomes',(SELECT count(*) FROM erp.customer_review_outcomes WHERE company_id='${tenant}' AND revision_id='${deurIds[9]}'),
        'rawPersisted',EXISTS(
          SELECT 1 FROM erp.notification_outbox WHERE company_id='${tenant}'
            AND to_jsonb(notification_outbox)::text LIKE '%${replacementToken}%'
          UNION ALL
          SELECT 1 FROM erp.notification_delivery_attempts WHERE company_id='${tenant}'
            AND to_jsonb(notification_delivery_attempts)::text LIKE '%${replacementToken}%'
          UNION ALL
          SELECT 1 FROM erp.audit_log WHERE company_id='${tenant}'
            AND to_jsonb(audit_log)::text LIKE '%${replacementToken}%'
        )
      );
    `);
    expect(evidence).toContain('"oldSuperseded": true');
    expect(evidence).toContain('"oldAttemptStatus": "FailedCredentialLost"');
    expect(evidence).toContain('"newAccepted": true');
    expect(evidence).toContain('"audit": 1');
    expect(evidence).toContain('"requests": 2');
    expect(evidence).toContain('"outcomes": 1');
    expect(evidence).toContain('"rawPersisted": false');
  }, 120_000);

  it("cleanup contract is idempotent and leaves no deterministic fixture residue", () => {
    cleanup();
    cleanup();
    const residue = owner(`
      SELECT jsonb_build_object(
        'companies',(SELECT count(*) FROM erp.companies WHERE id='${tenant}'),
        'reviews',(SELECT count(*) FROM erp.customer_review_requests WHERE company_id='${tenant}'),
        'outcomes',(SELECT count(*) FROM erp.customer_review_outcomes WHERE company_id='${tenant}'),
        'corrections',(SELECT count(*) FROM erp.customer_correction_requests WHERE company_id='${tenant}')
      );
    `);
    expect(residue).toContain('"companies": 0');
    expect(residue).toContain('"reviews": 0');
    expect(residue).toContain('"outcomes": 0');
    expect(residue).toContain('"corrections": 0');
  }, 30_000);
});
