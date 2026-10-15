import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { GuardedProjectReviewFirstDelivery, GUARDED_PROJECT_REVIEW_SCOPE,
  type GuardedDeliveryDependencies } from "../server/notifications/GuardedProjectReviewFirstDelivery";
import { decryptGroupedReviewDeliveryEnvelope } from "../server/notifications/GroupedReviewDeliveryEnvelope";
import { SupabaseTrustedNotificationRepository } from "../server/notifications/SupabaseTrustedNotificationRepository";
import { TrustedNotificationWorker, type ClaimedNotification,
  type TrustedNotificationWorkerRepository } from "../server/notifications/TrustedNotificationWorker";

const request = { confirmation: "PROJECT-LEGACY-FIRST-DELIVERY" as const, recipientOverrideFingerprint: "a".repeat(64) };
const accepted = { claimed: 1, providerCalls: 1, status: "ProviderAccepted" as const, ambiguous: false };
function dependencies(overrides: Partial<GuardedDeliveryDependencies> = {}): GuardedDeliveryDependencies {
  return {
    repository: {
      preflightGuardedProjectReviewFirstDelivery: vi.fn(async input => ({ success: true, disposition: "READY",
        value: { activeEnvelopeCount: input.phase === "BEFORE_PREPARATION" ? 0 : 2 } })),
      prepareExactProjectReviewBatch: vi.fn(async () => ({ success: true, disposition: "PREPARED" })),
      validateExactProjectReviewCredentials: vi.fn(async () => true),
    },
    providerReady: vi.fn(async (): Promise<"VALID"> => "VALID"),
    recipientOverrideMatches: vi.fn(async () => true),
    dispatch: vi.fn(async () => accepted),
    ...overrides,
  };
}

describe("guarded Project Review first delivery", () => {
  it("preflights and dispatches only the hard-pinned batch and notification IDs", async () => {
    const deps = dependencies();
    await expect(new GuardedProjectReviewFirstDelivery(deps).run("actor", "EXECUTE", request)).resolves.toEqual({
      success: true, disposition: "DELIVERED", prepared: true, dispatched: [...GUARDED_PROJECT_REVIEW_SCOPE.notificationIds],
    });
    expect(deps.repository.prepareExactProjectReviewBatch).toHaveBeenCalledWith(
      GUARDED_PROJECT_REVIEW_SCOPE.batchId, GUARDED_PROJECT_REVIEW_SCOPE.notificationIds,
    );
    expect(vi.mocked(deps.dispatch).mock.calls.map(([id]) => id)).toEqual([...GUARDED_PROJECT_REVIEW_SCOPE.notificationIds]);
    expect(deps.repository.preflightGuardedProjectReviewFirstDelivery).toHaveBeenNthCalledWith(1, expect.objectContaining({
      batchId: GUARDED_PROJECT_REVIEW_SCOPE.batchId, deurNumber: GUARDED_PROJECT_REVIEW_SCOPE.deurNumber,
      notificationIds: GUARDED_PROJECT_REVIEW_SCOPE.notificationIds, phase: "BEFORE_PREPARATION",
    }));
    expect(deps.repository.preflightGuardedProjectReviewFirstDelivery).toHaveBeenNthCalledWith(2, expect.objectContaining({ phase: "AFTER_PREPARATION" }));
  });

  it("keeps read-only preflight free of preparation, claims, and dispatch", async () => {
    const deps = dependencies();
    await expect(new GuardedProjectReviewFirstDelivery(deps).run("actor", "PREFLIGHT", request)).resolves.toMatchObject({
      success: true, disposition: "PREFLIGHT_READY", prepared: false, dispatched: [],
    });
    expect(deps.repository.prepareExactProjectReviewBatch).not.toHaveBeenCalled();
    expect(deps.dispatch).not.toHaveBeenCalled();
  });

  it("blocks an invalid recipient override before provider or database calls", async () => {
    const deps = dependencies({ recipientOverrideMatches: vi.fn(async () => false) });
    await expect(new GuardedProjectReviewFirstDelivery(deps).run("actor", "EXECUTE", request)).resolves.toMatchObject({
      success: false, code: "RECIPIENT_OVERRIDE_MISMATCH", prepared: false,
    });
    expect(deps.providerReady).not.toHaveBeenCalled();
    expect(deps.repository.preflightGuardedProjectReviewFirstDelivery).not.toHaveBeenCalled();
    expect(deps.dispatch).not.toHaveBeenCalled();
  });

  it("blocks an invalid batch scope before provider readiness is probed", async () => {
    const deps = dependencies({ repository: {
      preflightGuardedProjectReviewFirstDelivery: vi.fn(async () => ({ success: false, code: "NOTIFICATION_MEMBERSHIP_MISMATCH" })),
      prepareExactProjectReviewBatch: vi.fn(),
      validateExactProjectReviewCredentials: vi.fn(),
    } });
    await expect(new GuardedProjectReviewFirstDelivery(deps).run("actor", "EXECUTE", request)).resolves.toMatchObject({
      success: false, code: "NOTIFICATION_MEMBERSHIP_MISMATCH", prepared: false,
    });
    expect(deps.providerReady).not.toHaveBeenCalled();
    expect(deps.dispatch).not.toHaveBeenCalled();
  });

  it("blocks invalid stored credentials before provider readiness or preparation", async () => {
    const prepare = vi.fn();
    const deps = dependencies({ repository: {
      preflightGuardedProjectReviewFirstDelivery: vi.fn(async () => ({ success: true, disposition: "READY", value: { activeEnvelopeCount: 2 } })),
      prepareExactProjectReviewBatch: prepare,
      validateExactProjectReviewCredentials: vi.fn(async () => false),
    } });
    await expect(new GuardedProjectReviewFirstDelivery(deps).run("actor", "EXECUTE", request)).resolves.toMatchObject({
      success: false, code: "CREDENTIAL_VALIDATION_FAILED", prepared: false, dispatched: [],
    });
    expect(deps.providerReady).not.toHaveBeenCalled();
    expect(prepare).not.toHaveBeenCalled();
    expect(deps.dispatch).not.toHaveBeenCalled();
  });

  it("stops after preparation when the stored credential cannot be revalidated", async () => {
    const validateCredentials = vi.fn().mockResolvedValueOnce(false);
    const deps = dependencies({ repository: {
      preflightGuardedProjectReviewFirstDelivery: vi.fn(async input => ({ success: true, disposition: "READY",
        value: { activeEnvelopeCount: input.phase === "BEFORE_PREPARATION" ? 0 : 2 } })),
      prepareExactProjectReviewBatch: vi.fn(async () => ({ success: true, disposition: "PREPARED" })),
      validateExactProjectReviewCredentials: validateCredentials,
    } });
    await expect(new GuardedProjectReviewFirstDelivery(deps).run("actor", "EXECUTE", request)).resolves.toMatchObject({
      success: false, code: "CREDENTIAL_VALIDATION_FAILED", prepared: true, dispatched: [],
    });
    expect(validateCredentials).toHaveBeenCalledTimes(1);
    expect(deps.dispatch).not.toHaveBeenCalled();
  });

  it("records a provider failure through the canonical worker and leaves the second notification untouched", async () => {
    const dispatch = vi.fn().mockResolvedValueOnce({ claimed: 1, providerCalls: 1, status: "FailedCredentialLost", ambiguous: false });
    const deps = dependencies({ dispatch });
    await expect(new GuardedProjectReviewFirstDelivery(deps).run("actor", "EXECUTE", request)).resolves.toMatchObject({
      success: false, code: "PROVIDER_DELIVERY_FAILED", dispatched: [GUARDED_PROJECT_REVIEW_SCOPE.notificationIds[0]],
    });
    expect(dispatch).toHaveBeenCalledOnce();
  });

  it("stops immediately on ambiguous provider acceptance and never retries", async () => {
    const dispatch = vi.fn().mockResolvedValueOnce({ claimed: 1, providerCalls: 1, status: "UnknownOutcome", ambiguous: true });
    const deps = dependencies({ dispatch });
    await expect(new GuardedProjectReviewFirstDelivery(deps).run("actor", "EXECUTE", request)).resolves.toMatchObject({
      success: false, code: "AMBIGUOUS_PROVIDER_OUTCOME", ambiguous: true,
      dispatched: [GUARDED_PROJECT_REVIEW_SCOPE.notificationIds[0]],
    });
    expect(dispatch).toHaveBeenCalledOnce();
  });

  it("blocks repeated execution after an accepted message without a duplicate provider call", async () => {
    const preflight = vi.fn()
      .mockResolvedValueOnce({ success: true, disposition: "READY", value: { activeEnvelopeCount: 0 } })
      .mockResolvedValueOnce({ success: true, disposition: "READY", value: { activeEnvelopeCount: 2 } })
      .mockResolvedValueOnce({ success: false, code: "NOTIFICATION_NOT_ELIGIBLE" });
    const deps = dependencies({ repository: {
      preflightGuardedProjectReviewFirstDelivery: preflight,
      prepareExactProjectReviewBatch: vi.fn(async () => ({ success: true, disposition: "PREPARED" })),
      validateExactProjectReviewCredentials: vi.fn(async () => true),
    } });
    vi.mocked(deps.dispatch).mockResolvedValueOnce(accepted).mockResolvedValueOnce({
      claimed: 1, providerCalls: 1, status: "UnknownOutcome", ambiguous: true,
    });
    await new GuardedProjectReviewFirstDelivery(deps).run("actor", "EXECUTE", request);
    await expect(new GuardedProjectReviewFirstDelivery(deps).run("actor", "EXECUTE", request)).resolves.toMatchObject({
      success: false, code: "NOTIFICATION_NOT_ELIGIBLE", prepared: false,
    });
    expect(deps.dispatch).toHaveBeenCalledTimes(2);
  });
});

describe("canonical exact preparation and claim behavior", () => {
  it("prepares the specified batch directly without global discovery", async () => {
    const key = Buffer.alloc(32, 9); let command: Record<string, any> | undefined;
    const rpc = vi.fn(async (name: string, parameters: Record<string, any>) => {
      if (name !== "prepare_project_review_batch_handoff") throw new Error(`unexpected RPC ${name}`);
      command = parameters.command; return { data: { success: true, disposition: "PREPARED" }, error: null };
    });
    const client = { schema: () => ({ rpc }) } as unknown as SupabaseClient;
    const repository = new SupabaseTrustedNotificationRepository(client, client, key);
    await repository.prepareExactProjectReviewBatch(GUARDED_PROJECT_REVIEW_SCOPE.batchId, GUARDED_PROJECT_REVIEW_SCOPE.notificationIds);
    expect(rpc).toHaveBeenCalledOnce();
    expect(command?.batchId).toBe(GUARDED_PROJECT_REVIEW_SCOPE.batchId);
    expect(command?.envelopes.map((value: { notificationId: string }) => value.notificationId)).toEqual([...GUARDED_PROJECT_REVIEW_SCOPE.notificationIds]);
    const paths = command!.envelopes.map((envelope: any) => decryptGroupedReviewDeliveryEnvelope(envelope, envelope.notificationId, key));
    expect(paths[0]).toBe(paths[1]);
  });

  it("allows only one concurrent canonical claim and one provider call", async () => {
    let claimed = false;
    const intent: ClaimedNotification = { id: GUARDED_PROJECT_REVIEW_SCOPE.notificationIds[0], companyId: "tenant",
      type: "CUSTOMER_GROUPED_REVIEW_REQUESTED", recipient: { destination: "snapshot@example.test", displayName: "Reviewer" },
      sourceAggregateType: "CUSTOMER_REVIEW_BATCH", sourceAggregateId: GUARDED_PROJECT_REVIEW_SCOPE.batchId,
      templateVersion: 3, idempotencyKey: "stable", requiresReviewCredential: false, attempt: 1,
      input: { recipientName: "Reviewer", companyName: "Company", rentalReference: "Project review" } };
    const repository: TrustedNotificationWorkerRepository = { claimBatch: async () => [],
      claim: async () => claimed ? false : (claimed = true), getIntent: async () => intent, complete: vi.fn() };
    const provider = { name: "synthetic", send: vi.fn(async () => ({ accepted: true as const, provider: "synthetic", providerMessageId: "safe" })) };
    const worker = new TrustedNotificationWorker(repository, provider, "sender@example.test");
    const results = await Promise.all([worker.runExistingNotificationDetailed(intent.id), worker.runExistingNotificationDetailed(intent.id)]);
    expect(results.map(value => value.claimed).sort()).toEqual([0, 1]);
    expect(provider.send).toHaveBeenCalledOnce();
  });

  it("persists a guarded credential-bearing provider failure as terminal with no retry delay", async () => {
    const intent: ClaimedNotification = { id: GUARDED_PROJECT_REVIEW_SCOPE.notificationIds[0], companyId: "tenant",
      type: "CUSTOMER_GROUPED_REVIEW_REQUESTED", recipient: { destination: "snapshot@example.test", displayName: "Reviewer" },
      sourceAggregateType: "CUSTOMER_REVIEW_BATCH", sourceAggregateId: GUARDED_PROJECT_REVIEW_SCOPE.batchId,
      templateVersion: 3, idempotencyKey: "stable", requiresReviewCredential: true, attempt: 1,
      input: { recipientName: "Reviewer", companyName: "Company", rentalReference: "Project review" } };
    const complete = vi.fn();
    const repository: TrustedNotificationWorkerRepository = { claimBatch: async () => [], claim: async () => true,
      getIntent: async () => intent, resolveGroupedReviewDelivery: async () => ({ status: "ACTIVE", reviewPath: "/review/customer/grouped/synthetic" }), complete };
    const provider = { name: "synthetic", send: vi.fn(async () => ({ accepted: false as const, provider: "synthetic",
      category: "TemporaryProviderFailure" as const, diagnostic: { deliveryOutcome: "KNOWN_PROVIDER_RESPONSE" as const, retryable: true } })) };
    const worker = new TrustedNotificationWorker(repository, provider, "sender@example.test");
    await expect(worker.runExistingNotificationDetailed(intent.id, undefined, { terminalReviewFailure: true })).resolves.toMatchObject({
      status: "FailedCredentialLost", ambiguous: false,
    });
    expect(complete).toHaveBeenCalledWith(expect.objectContaining({ status: "FailedCredentialLost", retryAfterSeconds: undefined }));
  });
});

describe("guarded preflight migration contract", () => {
  const sql = readFileSync("supabase/migrations/20261014000300_guarded_project_review_first_delivery_preflight.sql", "utf8");
  it("is read-only, service-only, tenant/role checked, and preserves snapshots", () => {
    expect(sql).toContain("STABLE SECURITY DEFINER");
    expect(sql).toContain("auth.role()<>'service_role'");
    expect(sql).toContain("settings.update");
    expect(sql).toContain("system-administrator");
    expect(sql).toContain("group_scope='PROJECT'");
    expect(sql).toContain("recipient_snapshot");
    expect(sql).toContain("attempt_count<>0");
    expect(sql).toContain("notification_delivery_attempts");
    expect(sql).not.toMatch(/^\s*(?:INSERT|UPDATE|DELETE)\b/im);
    expect(sql).not.toMatch(/GRANT\s+(?:SELECT|INSERT|UPDATE|DELETE)/i);
  });

  it("keeps the certified UAT migrations unchanged and assigns the next unique version", () => {
    const migrations = readdirSync("supabase/migrations").filter(name => /^\d{14}_.*\.sql$/.test(name)).sort();
    const versions = migrations.map(name => name.slice(0, 14));
    expect(new Set(versions).size).toBe(versions.length);
    expect(migrations.slice(-4)).toEqual([
      "20261014000100_project_review_multi_deur_line_membership.sql",
      "20261014000200_deur_hour_meter_refuel_evidence.sql",
      "20261014000300_guarded_project_review_first_delivery_preflight.sql",
      "20261014000400_guarded_project_review_first_delivery_preflight_ambiguous_id.sql",
    ]);
  });

  it("qualifies the expected notification identifier in the forward-only correction", () => {
    const correction = readFileSync(
      "supabase/migrations/20261014000400_guarded_project_review_first_delivery_preflight_ambiguous_id.sql",
      "utf8",
    );
    expect(correction).toContain(
      "FROM unnest(expected_ids) AS expected_notification(expected_notification_id)",
    );
    expect(correction).toContain("intent.id=expected_notification.expected_notification_id");
    expect(correction).not.toContain("FROM unnest(expected_ids) id");
    expect(correction).not.toMatch(/^\s*(?:INSERT|UPDATE|DELETE)\b/im);
  });
});
