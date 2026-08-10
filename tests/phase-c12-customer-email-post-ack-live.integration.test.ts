import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  assertSafeSupabaseTestConfiguration,
  createSupabasePhaseC2Harness,
  readSupabasePhaseC2TestConfiguration,
} from "./support/supabasePhaseC2Harness";
import { executePhaseC4bPrivilegedSql } from "./support/phaseC4bPrivilegedSql";

const configuration = readSupabasePhaseC2TestConfiguration();
const enabled = configuration.enabled && process.env.RUN_PHASE_C12_POST_ACK_CERTIFICATION === "true";
const tenant = "TENANT-UAT-C12-CUSTOMER-EMAIL-001";

function owner(sql: string) {
  return executePhaseC4bPrivilegedSql(configuration, { tenantIds: [tenant], sql });
}

const evidenceSql = `SELECT jsonb_build_object(
  'requestCount',(SELECT count(*) FROM erp.customer_review_requests WHERE company_id='${tenant}'),
  'requestStatus',(SELECT status FROM erp.customer_review_requests WHERE company_id='${tenant}'),
  'consumed',(SELECT consumed_at IS NOT NULL FROM erp.customer_review_requests WHERE company_id='${tenant}'),
  'outcomes',(SELECT count(*) FROM erp.customer_review_outcomes WHERE company_id='${tenant}'),
  'acknowledgeOutcomes',(SELECT count(*) FROM erp.customer_review_outcomes WHERE company_id='${tenant}' AND action='ACKNOWLEDGE'),
  'outcomeFingerprint',(SELECT md5(to_jsonb(outcome)::text) FROM erp.customer_review_outcomes outcome WHERE company_id='${tenant}'),
  'corrections',(SELECT count(*) FROM erp.customer_correction_requests WHERE company_id='${tenant}'),
  'deurAcknowledged',(SELECT count(*) FROM erp.deurs WHERE company_id='${tenant}' AND status='Acknowledged' AND coalesce(revision_number,1)=1),
  'companyFrozen',(SELECT snapshot->>'companyName'=(SELECT name FROM erp.companies WHERE id='${tenant}') FROM erp.customer_review_requests WHERE company_id='${tenant}'),
  'reviewIntents',(SELECT count(*) FROM erp.notification_outbox WHERE company_id='${tenant}' AND notification_type='CUSTOMER_REVIEW_REQUESTED'),
  'reviewAttempts',(SELECT count(*) FROM erp.notification_delivery_attempts attempt JOIN erp.notification_outbox intent ON intent.id=attempt.notification_id WHERE intent.company_id='${tenant}' AND intent.notification_type='CUSTOMER_REVIEW_REQUESTED'),
  'reviewAccepted',(SELECT count(*) FROM erp.notification_delivery_attempts attempt JOIN erp.notification_outbox intent ON intent.id=attempt.notification_id WHERE intent.company_id='${tenant}' AND intent.notification_type='CUSTOMER_REVIEW_REQUESTED' AND attempt.status='ProviderAccepted'),
  'ackIntents',(SELECT count(*) FROM erp.notification_outbox WHERE company_id='${tenant}' AND notification_type='CUSTOMER_ACKNOWLEDGED'),
  'ackPending',(SELECT count(*) FROM erp.notification_outbox WHERE company_id='${tenant}' AND notification_type='CUSTOMER_ACKNOWLEDGED' AND status='Pending'),
  'ackAttempts',(SELECT count(*) FROM erp.notification_delivery_attempts attempt JOIN erp.notification_outbox intent ON intent.id=attempt.notification_id WHERE intent.company_id='${tenant}' AND intent.notification_type='CUSTOMER_ACKNOWLEDGED'),
  'forbiddenNotifications',(SELECT count(*) FROM erp.notification_outbox WHERE company_id='${tenant}' AND notification_type NOT IN('CUSTOMER_REVIEW_REQUESTED','CUSTOMER_ACKNOWLEDGED')),
  'managerEvidence',(SELECT count(*) FROM erp.manager_review_requests WHERE company_id='${tenant}'),
  'billingEvidence',(SELECT count(*) FROM erp.billing_statements WHERE company_id='${tenant}'),
  'providerMessageId',(SELECT attempt.provider_message_id FROM erp.notification_delivery_attempts attempt JOIN erp.notification_outbox intent ON intent.id=attempt.notification_id WHERE intent.company_id='${tenant}' AND intent.notification_type='CUSTOMER_REVIEW_REQUESTED' AND attempt.status='ProviderAccepted' LIMIT 1)
);`;

function evidence() {
  return JSON.parse(owner(evidenceSql)).rows[0].jsonb_build_object as Record<string, unknown>;
}

function expectedState(value: Record<string, unknown>) {
  expect(value).toMatchObject({
    requestCount: 1,
    requestStatus: "Acknowledged",
    consumed: true,
    outcomes: 1,
    acknowledgeOutcomes: 1,
    corrections: 0,
    deurAcknowledged: 1,
    companyFrozen: true,
    reviewIntents: 1,
    reviewAttempts: 1,
    reviewAccepted: 1,
    ackIntents: 1,
    ackPending: 1,
    ackAttempts: 0,
    forbiddenNotifications: 0,
    managerEvidence: 0,
    billingEvidence: 0,
  });
}

describe.skipIf(!enabled)("C12 customer-email post-acknowledgement certification", () => {
  it("keeps the canonical two-intent matrix and rejects a consumed-credential replay", async () => {
    assertSafeSupabaseTestConfiguration(configuration);
    const readbackKey = process.env.RESEND_READBACK_API_KEY?.trim();
    if (!readbackKey) throw new Error("Readback configuration is missing.");
    const before = evidence();
    expectedState(before);
    const messageId = String(before.providerMessageId ?? "");
    const outcomeFingerprint = String(before.outcomeFingerprint ?? "");
    expect(messageId).toBeTruthy();
    expect(outcomeFingerprint).toBeTruthy();

    const response = await fetch(`https://api.resend.com/emails/${encodeURIComponent(messageId)}`, {
      headers: { Authorization: `Bearer ${readbackKey}` },
    });
    expect(response.status).toBe(200);
    const message = await response.json() as { html?: string; text?: string };
    const content = `${message.html ?? ""}\n${message.text ?? ""}`;
    const delivered = content.match(/https:\/\/[^\s"'<>]+\/review\/deur\/([0-9a-fA-F]{64})/);
    expect(delivered).toBeTruthy();

    const harness = createSupabasePhaseC2Harness(configuration);
    const unavailable = await harness.anonymous.schema("erp").rpc("get_public_customer_review", {
      command: { token: delivered![1] },
    });
    expect(unavailable.error).toBeNull();
    expect(unavailable.data).toMatchObject({ success: true, disposition: "ALREADY_COMPLETED" });

    const replay = await harness.anonymous.schema("erp").rpc("public_acknowledge_customer_review", {
      command: { token: delivered![1], commandId: randomUUID(), idempotencyKey: randomUUID() },
    });
    expect(replay.error).toBeNull();
    expect(replay.data).toMatchObject({ success: false, code: "ALREADY_COMPLETED" });

    const after = evidence();
    expectedState(after);
    expect(after.outcomeFingerprint).toBe(outcomeFingerprint);
    console.info(JSON.stringify({
      revisedNotificationMatrix: "PASSED",
      anonymousLookup: "ALREADY_COMPLETED",
      replayResult: "ALREADY_COMPLETED",
      outcomeCount: 1,
      providerAttemptCount: 1,
    }));
  }, 60_000);
});
