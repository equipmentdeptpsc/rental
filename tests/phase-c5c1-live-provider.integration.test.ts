import { randomBytes, randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { renderNotificationTemplate } from "@/features/notifications/templates";
import type { NotificationType } from "@/features/notifications/domain";
import { ResendEmailDeliveryProvider } from "../server/notifications/ResendEmailDeliveryProvider";
import { parseNotificationServerConfiguration } from "../server/notifications/config";
import {
  assertSupabaseFixtureMutationAllowed, readSupabasePhaseC2TestConfiguration,
} from "./support/supabasePhaseC2Harness";
import { executePhaseC4bPrivilegedSql } from "./support/phaseC4bPrivilegedSql";

const configuration = readSupabasePhaseC2TestConfiguration();
const enabled = configuration.enabled && process.env.RUN_PHASE_C5C1_PROVIDER_LIVE === "true";
const tenant = "TENANT-UAT-C5C1-PROVIDER";

describe.skipIf(!enabled)("Phase C5C.1 real provider acceptance", () => {
  const service = enabled ? createClient(configuration.url!, configuration.serviceKey!, {
    auth: { persistSession: false, autoRefreshToken: false },
  }) : undefined;
  const owner = (sql: string) => executePhaseC4bPrivilegedSql(configuration, { tenantIds: [tenant], sql });
  const cleanup = () => owner(`
    BEGIN;
    SET LOCAL session_replication_role='replica';
    DELETE FROM erp.notification_delivery_attempts WHERE company_id='${tenant}';
    DELETE FROM erp.notification_outbox WHERE company_id='${tenant}';
    DELETE FROM erp.companies WHERE id='${tenant}';
    COMMIT;
  `);
  const rpc = async (name: string, parameters: Record<string, unknown>) => {
    const result = await service!.schema("erp").rpc(name, parameters);
    expect(result.error, `${name}: ${result.error?.code ?? ""}`).toBeNull();
    return result.data as any;
  };

  beforeAll(() => {
    assertSupabaseFixtureMutationAllowed(configuration, [tenant]);
    for (const name of ["RESEND_API_KEY", "RESEND_FROM_ADDRESS", "EMAIL_UAT_RECIPIENT_OVERRIDE"]) {
      if (!process.env[name]) throw new Error(`Missing server-only provider configuration: ${name}`);
    }
    cleanup();
    owner(`INSERT INTO erp.companies(id,code,name,environment_class)
      VALUES('${tenant}','C5C1-PROVIDER','C5C1 Provider Certification','test');`);
  });
  afterAll(() => { cleanup(); cleanup(); });

  it("records controlled provider acceptance for customer, corrected, manager, and operations flows", async () => {
    const runId = randomUUID();
    const notificationConfiguration = parseNotificationServerConfiguration(process.env);
    const provider = new ResendEmailDeliveryProvider({
      apiKey: notificationConfiguration.resendApiKey,
      uatRecipientOverride: notificationConfiguration.uatRecipientOverride,
      timeoutMs: 15_000,
    });
    const rawCredential = randomBytes(32).toString("hex");
    const cases: Array<{ type: NotificationType; reviewPath?: string }> = [
      { type: "CUSTOMER_REVIEW_REQUESTED", reviewPath: `/review/deur/${rawCredential}` },
      { type: "CUSTOMER_CORRECTED_REVIEW_REQUESTED", reviewPath: `/review/deur/${randomBytes(32).toString("hex")}` },
      { type: "MANAGER_REVIEW_REQUESTED", reviewPath: `/review/manager/${randomBytes(32).toString("hex")}` },
      { type: "CUSTOMER_CORRECTION_WORK_ITEM" },
      { type: "MANAGER_CORRECTION_WORK_ITEM" },
    ];
    for (let index = 0; index < cases.length; index++) {
      const scenario = cases[index];
      const id = randomUUID(); const workerId = randomUUID();
      const idempotencyKey = `NOTIFY-UAT-C5C1-${runId}-${index + 1}`;
      expect(await rpc("create_notification_intent", { command: {
        id, companyId: tenant, notificationType: scenario.type,
        recipientDestination: "intended-recipient@example.invalid",
        recipientDisplayName: "Controlled UAT Recipient",
        sourceAggregateType: "C5C1_PROVIDER_CERTIFICATION",
        sourceAggregateId: `C5C1-${index + 1}`, templateVersion: 1,
        idempotencyKey, payloadFingerprint: String(index + 1).repeat(64),
      } })).toMatchObject({ success: true });
      expect(await rpc("claim_notification_delivery", {
        notification_id: id, worker_id: workerId,
      })).toMatchObject({ success: true });
      const email = renderNotificationTemplate(scenario.type, {
        recipientName: "Controlled UAT Recipient", companyName: "C5C1 Isolated UAT",
        rentalReference: `UAT-RENTAL-${index + 1}`, deurNumber: `UAT-DEUR-${index + 1}`,
        revisionLabel: index === 1 ? "R2" : "R1",
        reason: scenario.reviewPath ? undefined : "Controlled isolated-UAT correction evidence.",
        reviewUrl: scenario.reviewPath
          ? new URL(scenario.reviewPath, notificationConfiguration.publicBaseUrl).toString()
          : undefined,
      });
      const result = await provider.send({
        from: notificationConfiguration.fromAddress, to: "intended-recipient@example.invalid",
        recipientName: "Controlled UAT Recipient", email, idempotencyKey,
      });
      expect(result.accepted, result.accepted ? "" : result.category).toBe(true);
      if (!result.accepted) continue;
      expect(result.providerMessageId).toBeTruthy();
      expect(await rpc("complete_notification_delivery", { command: {
        id, workerId, status: "ProviderAccepted", providerName: result.provider,
        providerMessageId: result.providerMessageId,
      } })).toMatchObject({ success: true });
    }
    const evidence = owner(`
      SELECT jsonb_build_object(
        'accepted',(SELECT count(*) FROM erp.notification_outbox
          WHERE company_id='${tenant}' AND status='ProviderAccepted'
            AND provider_message_id IS NOT NULL),
        'attempts',(SELECT count(*) FROM erp.notification_delivery_attempts
          WHERE company_id='${tenant}' AND status='ProviderAccepted'),
        'rawCredentialPersisted',EXISTS(
          SELECT 1 FROM erp.notification_outbox WHERE company_id='${tenant}'
            AND to_jsonb(notification_outbox)::text LIKE '%${rawCredential}%'
          UNION ALL
          SELECT 1 FROM erp.notification_delivery_attempts WHERE company_id='${tenant}'
            AND to_jsonb(notification_delivery_attempts)::text LIKE '%${rawCredential}%'
        )
      );
    `);
    expect(evidence).toContain('"accepted": 5');
    expect(evidence).toContain('"attempts": 5');
    expect(evidence).toContain('"rawCredentialPersisted": false');
  }, 120_000);
});
