import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { assertSupabaseFixtureMutationAllowed, readSupabasePhaseC2TestConfiguration } from "./support/supabasePhaseC2Harness";
import { executePhaseC4bPrivilegedSql } from "./support/phaseC4bPrivilegedSql";
import { FakeEmailDeliveryProvider } from "../server/notifications/FakeEmailDeliveryProvider";

const configuration = readSupabasePhaseC2TestConfiguration();
const enabled = configuration.enabled && process.env.RUN_PHASE_C5C_LIVE === "true";
const tenant = "TENANT-UAT-C5C-OUTBOX";

describe.skipIf(!enabled)("Phase C5C notification outbox live certification", () => {
  const owner = (sql: string) => executePhaseC4bPrivilegedSql(configuration, { tenantIds: [tenant], sql });
  const service = enabled ? createClient(configuration.url!, configuration.serviceKey!, {
    auth: { persistSession: false, autoRefreshToken: false },
  }) : undefined;
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
    cleanup();
    owner(`INSERT INTO erp.companies(id,code,name,environment_class)
      VALUES('${tenant}','${tenant}','C5C Outbox','test');`);
  });
  afterAll(() => { cleanup(); cleanup(); });

  it("creates once, rejects mismatches, and permits only one parallel worker claim", async () => {
    const id = randomUUID();
    const command = {
      id, companyId: tenant, notificationType: "MANAGER_REVIEW_REQUESTED",
      recipientDestination: "delivered@resend.dev", recipientDisplayName: "UAT Manager",
      sourceAggregateType: "DEUR", sourceAggregateId: "DEUR-C5C-1",
      deurRevisionReference: "DEUR-C5C-1 R1", templateVersion: 1,
      idempotencyKey: "NOTIFY-UAT-C5C-1", payloadFingerprint: "a".repeat(64),
    };
    expect(await rpc("create_notification_intent", { command }))
      .toMatchObject({ success: true, disposition: "CREATED" });
    expect(await rpc("create_notification_intent", { command }))
      .toMatchObject({ success: true, disposition: "EXISTS" });
    expect(await rpc("create_notification_intent", {
      command: { ...command, payloadFingerprint: "b".repeat(64) },
    })).toMatchObject({ success: false, code: "IDEMPOTENCY_MISMATCH" });
    const workerA = randomUUID();
    const workerB = randomUUID();
    const claims = await Promise.all([
      rpc("claim_notification_delivery", { notification_id: id, worker_id: workerA }),
      rpc("claim_notification_delivery", { notification_id: id, worker_id: workerB }),
    ]);
    expect(claims.filter((claim) => claim.success)).toHaveLength(1);
    const winner = claims[0].success ? workerA : workerB;
    expect(await rpc("complete_notification_delivery", { command: {
      id, workerId: winner, status: "ProviderAccepted",
      providerName: "fake", providerMessageId: "NOTIFY-UAT-C5C-PROVIDER-1",
    } })).toMatchObject({ success: true, disposition: "RECORDED" });
    expect(await rpc("claim_notification_delivery", {
      notification_id: id, worker_id: randomUUID(),
    })).toMatchObject({ success: false, code: "NOT_CLAIMED" });
    const evidence = owner(`
      SELECT jsonb_build_object(
        'outbox',(SELECT count(*) FROM erp.notification_outbox WHERE company_id='${tenant}' AND status='ProviderAccepted'),
        'attempts',(SELECT count(*) FROM erp.notification_delivery_attempts WHERE company_id='${tenant}'),
        'rawCredentialColumns',EXISTS(
          SELECT 1 FROM information_schema.columns WHERE table_schema='erp'
            AND table_name IN('notification_outbox','notification_delivery_attempts')
            AND column_name IN('token','raw_token','token_hash','review_url','review_credential')
        )
      );
    `);
    expect(evidence).toContain('"outbox": 1');
    expect(evidence).toContain('"attempts": 1');
    expect(evidence).toContain('"rawCredentialColumns": false');
  });

  it("serializes two genuinely overlapping remote retry workers", async () => {
    const id = randomUUID();
    const command = {
      id, companyId: tenant, notificationType: "MANAGER_REVIEW_REQUESTED",
      recipientDestination: "controlled@example.invalid", recipientDisplayName: "UAT Manager",
      sourceAggregateType: "DEUR", sourceAggregateId: "DEUR-C5C-RETRY",
      deurRevisionReference: "DEUR-C5C-RETRY R1", templateVersion: 1,
      idempotencyKey: `NOTIFY-UAT-C5C-RETRY-${id}`, payloadFingerprint: "c".repeat(64),
    };
    expect(await rpc("create_notification_intent", { command }))
      .toMatchObject({ success: true, disposition: "CREATED" });
    const initialWorker = randomUUID();
    expect(await rpc("claim_notification_delivery", {
      notification_id: id, worker_id: initialWorker,
    })).toMatchObject({ success: true });
    expect(await rpc("complete_notification_delivery", { command: {
      id, workerId: initialWorker, status: "Failed", failureCategory: "TemporaryProviderFailure",
    } })).toMatchObject({ success: true });
    owner(`UPDATE erp.notification_outbox SET available_at=clock_timestamp()-interval '1 second'
      WHERE company_id='${tenant}' AND id='${id}';`);

    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const runWorker = async (workerId: string) => {
      await gate;
      const startedAt = performance.now();
      const result = await service!.schema("erp").rpc("claim_notification_delivery", {
        notification_id: id, worker_id: workerId,
      });
      return { workerId, startedAt, finishedAt: performance.now(), result };
    };
    const workerA = randomUUID();
    const workerB = randomUUID();
    const taskA = runWorker(workerA);
    const taskB = runWorker(workerB);
    await Promise.resolve();
    release();
    const [a, b] = await Promise.all([taskA, taskB]);
    expect(a.result.error).toBeNull();
    expect(b.result.error).toBeNull();
    const overlapped = Math.max(a.startedAt, b.startedAt) <= Math.min(a.finishedAt, b.finishedAt);
    expect(overlapped).toBe(true);
    const results = [a, b];
    const winners = results.filter((item) => (item.result.data as any)?.success);
    const losers = results.filter((item) => !(item.result.data as any)?.success);
    expect(winners).toHaveLength(1);
    expect(losers).toHaveLength(1);
    expect(losers[0].result.data).toMatchObject({ success: false, code: "NOT_CLAIMED" });
    const provider = new FakeEmailDeliveryProvider("success");
    const delivered = await provider.send({
      from: "controlled@example.invalid", to: "controlled@example.invalid",
      recipientName: "Controlled UAT Recipient",
      email: { subject: "Controlled retry", text: "No credential", html: "<p>No credential</p>" },
      idempotencyKey: command.idempotencyKey,
    });
    expect(delivered.accepted).toBe(true);
    expect(provider.evidence().callCount).toBe(1);
    expect(await rpc("complete_notification_delivery", { command: {
      id, workerId: winners[0].workerId, status: "ProviderAccepted",
      providerName: "fake", providerMessageId: "NOTIFY-UAT-C5C-RETRY",
    } })).toMatchObject({ success: true });
    const evidence = owner(`
      SELECT jsonb_build_object(
        'status',(SELECT status FROM erp.notification_outbox WHERE id='${id}'),
        'attemptCount',(SELECT attempt_count FROM erp.notification_outbox WHERE id='${id}'),
        'attemptRows',(SELECT count(*) FROM erp.notification_delivery_attempts WHERE notification_id='${id}'),
        'acceptedAttempts',(SELECT count(*) FROM erp.notification_delivery_attempts
          WHERE notification_id='${id}' AND status='ProviderAccepted')
      );
    `);
    expect(evidence).toContain('"status": "ProviderAccepted"');
    expect(evidence).toContain('"attemptCount": 2');
    expect(evidence).toContain('"attemptRows": 2');
    expect(evidence).toContain('"acceptedAttempts": 1');
    console.info(JSON.stringify({
      raceB: {
        remoteDb: true, provider: "controlled", overlap: overlapped,
        winner: "CLAIMED", loser: "NOT_CLAIMED", providerCalls: 1,
        finalState: "ProviderAccepted", duplicateDelivery: false, deadlock: false,
      },
    }));
  }, 60_000);
});
