import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import type { DeliveryStatus } from "@/features/notifications/domain";
import { FakeEmailDeliveryProvider } from "../server/notifications/FakeEmailDeliveryProvider";
import { decideNotificationFailure } from "../server/notifications/NotificationRetryPolicy";
import {
  TrustedNotificationWorker, type ClaimedNotification,
  type TrustedNotificationWorkerRepository,
} from "../server/notifications/TrustedNotificationWorker";
import {
  TrustedReviewIssuanceOrchestrator, type TrustedReviewIssuanceRepository,
} from "../server/notifications/TrustedReviewIssuanceOrchestrator";
import { ResendEmailDeliveryProvider } from "../server/notifications/ResendEmailDeliveryProvider";
import { parseNotificationServerConfiguration } from "../server/notifications/config";

const sql = readFileSync(
  "supabase/migrations/20260730003100_phase_c5c1_notification_orchestration.sql", "utf8",
);
const intent: ClaimedNotification = {
  id: "10000000-0000-4000-8000-000000000001", companyId: "TENANT-UAT-C5C1-TEST",
  type: "CUSTOMER_ACKNOWLEDGED",
  recipient: { destination: "intended@example.invalid", displayName: "UAT Recipient" },
  sourceAggregateType: "CUSTOMER_REVIEW_OUTCOME", sourceAggregateId: "outcome-1",
  templateVersion: 1, idempotencyKey: "NOTIFY-UAT-C5C1-1", attempt: 1,
  input: { recipientName: "UAT Recipient", companyName: "UAT Company", rentalReference: "R-UAT" },
};

class MemoryWorkerRepository implements TrustedNotificationWorkerRepository {
  claimed = false;
  completions: Array<{ id: string; status: DeliveryStatus }> = [];
  constructor(private readonly item: ClaimedNotification | null = intent) {}
  async claimBatch(): Promise<ClaimedNotification[]> {
    if (this.claimed || !this.item) return [];
    this.claimed = true;
    return [this.item];
  }
  async complete(input: { id: string; status: DeliveryStatus }): Promise<void> {
    this.completions.push({ id: input.id, status: input.status });
  }
}

describe("Phase C5C.1 trusted notification orchestration", () => {
  it("requires a configured non-placeholder HTTPS review origin and remains production-configurable", () => {
    const base = {
      RESEND_API_KEY: "server-secret", RESEND_FROM_ADDRESS: "sender@equipment.test",
    };
    expect(() => parseNotificationServerConfiguration({
      ...base, REVIEW_PUBLIC_BASE_URL: `https://${["uat", "example", "invalid"].join(".")}`,
    })).toThrow("credential-free HTTPS");
    expect(parseNotificationServerConfiguration({
      ...base, REVIEW_PUBLIC_BASE_URL: "https://psc-ed.equipmentdept-psc.workers.dev",
    }).publicBaseUrl).toBe("https://psc-ed.equipmentdept-psc.workers.dev/");
    expect(parseNotificationServerConfiguration({
      ...base, REVIEW_PUBLIC_BASE_URL: "https://erp.company.example/app",
    }).publicBaseUrl).toBe("https://erp.company.example/");
  });
  it("atomically enqueues all review request, outcome, and correction-work-item intents", () => {
    expect(sql).toContain("AFTER INSERT ON customer_review_requests");
    expect(sql).toContain("AFTER INSERT ON manager_review_requests");
    expect(sql).toContain("AFTER INSERT ON customer_review_outcomes");
    expect(sql).toContain("AFTER INSERT ON manager_review_outcomes");
    expect(sql).toContain("AFTER INSERT ON customer_correction_requests");
    expect(sql).toContain("AFTER INSERT ON manager_correction_requests");
    expect(sql).toContain("requires_review_credential");
    expect(sql).not.toMatch(/ADD COLUMN (?:raw_)?token|ADD COLUMN review_url/i);
  });

  it("keeps RPCs narrow, search paths explicit, and notification tables inaccessible directly", () => {
    expect(sql).toMatch(/SECURITY DEFINER SET search_path=erp,(?:auth,)?pg_catalog/g);
    expect(sql).toContain("TO service_role");
    expect(sql).not.toMatch(/GRANT (?:ALL|SELECT|INSERT|UPDATE|DELETE) ON (?:TABLE )?notification_/i);
    expect(sql).not.toMatch(/TO (?:PUBLIC|anon)\s*;/i);
  });

  it.each([
    ["timeout link", "Timeout", true, 1, "UnknownOutcome", false],
    ["definitive link failure", "InvalidRecipient", true, 1, "FailedCredentialLost", false],
    ["temporary confirmation", "TemporaryProviderFailure", false, 1, "Failed", true],
    ["rate limited confirmation", "RateLimited", false, 1, "Failed", true],
    ["terminal recipient", "InvalidRecipient", false, 1, "DeadLetter", false],
    ["exhausted retry", "TemporaryProviderFailure", false, 5, "DeadLetter", false],
  ] as const)("%s follows the bounded retry policy", (_label, category, link, attempt, status, retryable) => {
    expect(decideNotificationFailure(category, link, attempt)).toMatchObject({ status, retryable });
  });

  it.each([
    "success", "temporary-failure", "rate-limited", "timeout-before-acceptance",
    "timeout-after-acceptance", "invalid-recipient", "authentication-failure",
    "permanent-rejection", "malformed-response",
  ] as const)("provides reusable fake mode %s with redacted evidence", async (mode) => {
    const provider = new FakeEmailDeliveryProvider(mode);
    await provider.send({
      from: "sender@example.invalid", to: "recipient@example.invalid", recipientName: "Recipient",
      email: { subject: "UAT", text: "opaque", html: "<p>opaque</p>" }, idempotencyKey: "safe-key",
    });
    expect(provider.evidence()).toMatchObject({ callCount: 1 });
    expect(JSON.stringify(provider.evidence())).not.toContain("Bearer ");
  });

  it("Race 1: duplicate workers produce one claim, provider call, and accepted result", async () => {
    const repository = new MemoryWorkerRepository();
    const provider = new FakeEmailDeliveryProvider("success");
    const workers = [
      new TrustedNotificationWorker(repository, provider, "sender@example.invalid"),
      new TrustedNotificationWorker(repository, provider, "sender@example.invalid"),
    ];
    const results = await Promise.all(workers.map((worker) => worker.runOnce()));
    expect(results.reduce((sum, result) => sum + result.claimed, 0)).toBe(1);
    expect(provider.evidence().callCount).toBe(1);
    expect(repository.completions).toEqual([{ id: intent.id, status: "ProviderAccepted" }]);
  });

  it("Race 2: supersession before claim produces no provider invocation", async () => {
    const provider = new FakeEmailDeliveryProvider("success");
    const result = await new TrustedNotificationWorker(
      new MemoryWorkerRepository(null), provider, "sender@example.invalid",
    ).runOnce();
    expect(result).toEqual({ claimed: 0, providerCalls: 0 });
    expect(provider.evidence().callCount).toBe(0);
  });

  it("Race 3: concurrent retries retain one canonical attempt", async () => {
    const retryIntent = { ...intent, attempt: 2 };
    const repository = new MemoryWorkerRepository(retryIntent);
    const provider = new FakeEmailDeliveryProvider("temporary-failure");
    const worker = new TrustedNotificationWorker(repository, provider, "sender@example.invalid");
    await Promise.all([worker.runOnce(), worker.runOnce()]);
    expect(provider.evidence().callCount).toBe(1);
    expect(repository.completions).toEqual([{ id: intent.id, status: "Failed" }]);
  });

  it("Race 4: issuance replay emits one credential-bearing provider call", async () => {
    const provider = new FakeEmailDeliveryProvider("success");
    let issuance = 0; let claimed = false;
    const repository: TrustedReviewIssuanceRepository = {
      issue: async () => ++issuance === 1
        ? { success: true, disposition: "ACCEPTED", reviewPath: "/review/deur/opaque",
          notificationIntentId: intent.id,
          value: { notification: { reviewPath: "/review/deur/opaque" } } }
        : { success: true, disposition: "REPLAYED" },
      getIntent: async () => ({ ...intent, type: "CUSTOMER_REVIEW_REQUESTED",
        requiresReviewCredential: true }),
      claim: async () => claimed ? false : (claimed = true),
      claimBatch: async () => [],
      complete: vi.fn(),
    };
    const service = new TrustedReviewIssuanceOrchestrator(
      repository, provider, "sender@equipment.test", "https://psc-ed.equipmentdept-psc.workers.dev",
    );
    const results = await Promise.all([service.issue("customer", {}), service.issue("customer", {})]);
    expect(results.map((result) => result.disposition).sort()).toEqual(["ACCEPTED", "REPLAYED"]);
    expect(provider.evidence().callCount).toBe(1);
    expect(JSON.stringify(results[0])).not.toContain("/review/deur/opaque");
    const sent = provider.evidence();
    expect(sent.redactedCalls[0].containsReviewUrl).toBe(true);
    expect(sent.redactedCalls[0].containsPlaceholderHost).toBe(false);
  });

  it("Race 5: changed payload keeps the winner immutable and makes no second call", async () => {
    const repository = new MemoryWorkerRepository();
    const provider = new FakeEmailDeliveryProvider("success");
    const worker = new TrustedNotificationWorker(repository, provider, "sender@example.invalid");
    await Promise.all([worker.runOnce(), worker.runOnce()]);
    expect(provider.evidence().redactedCalls).toHaveLength(1);
    expect(intent.recipient.destination).toBe("intended@example.invalid");
  });

  it("classifies malformed, connection, timeout, and UAT-override Resend behavior safely", async () => {
    const malformed = new ResendEmailDeliveryProvider({ apiKey: "secret" },
      vi.fn().mockResolvedValue(new Response("{}", { status: 200 })));
    await expect(malformed.send({
      from: "sender@example.invalid", to: "recipient@example.invalid", recipientName: "Recipient",
      email: { subject: "Subject", text: "Text", html: "<p>Text</p>" }, idempotencyKey: "key",
    })).resolves.toMatchObject({ accepted: false, category: "ProviderParseError",
      diagnostic: { deliveryOutcome: "UNKNOWN_DELIVERY_OUTCOME", retryable: false } });

    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: "accepted-id" }), { status: 200 }));
    const uat = new ResendEmailDeliveryProvider({
      apiKey: "secret", uatRecipientOverride: "controlled@example.invalid",
    }, fetcher);
    await uat.send({
      from: "sender@example.invalid", to: "real-operations@example.invalid", recipientName: "Recipient",
      email: { subject: "Subject", text: "Text", html: "<p>Text</p>" }, idempotencyKey: "key",
    });
    const body = JSON.parse(fetcher.mock.calls[0][1].body);
    expect(body.to).toEqual(["controlled@example.invalid"]);
    expect(body.subject).toMatch(/^\[UAT\]/);
    expect(body.text).toContain("ISOLATED UAT TEST MESSAGE");
  });
});
