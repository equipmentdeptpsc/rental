import { describe, expect, it, vi } from "vitest";
import { renderNotificationTemplate } from "@/features/notifications/templates";
import { NotificationDeliveryService, type NotificationDeliveryRepository } from "@/features/notifications/NotificationDeliveryService";
import type { EmailDeliveryProvider } from "@/features/notifications/EmailDeliveryProvider";
import { ResendEmailDeliveryProvider } from "../server/notifications/ResendEmailDeliveryProvider";
import type { NotificationIntent } from "@/features/notifications/domain";
import { readFileSync } from "node:fs";

const migration = readFileSync("supabase/migrations/20260730002900_phase_c5c_notification_outbox.sql", "utf8");
const resolutionMigration = readFileSync(
  "supabase/migrations/20260730003000_phase_c5c_service_rpc_resolution.sql", "utf8",
);

const intent: NotificationIntent = {
  id: "notification-1", companyId: "tenant", type: "MANAGER_REVIEW_REQUESTED",
  recipient: { destination: "delivered@resend.dev", displayName: "Manager" },
  sourceAggregateType: "DEUR", sourceAggregateId: "business-reference",
  templateVersion: 1, idempotencyKey: "safe-idempotency",
  input: { recipientName: "<Manager>", companyName: "A & B", rentalReference: "R-1",
    reason: "<script>alert(1)</script>", reviewUrl: "https://review.invalid/opaque" },
};

describe("Phase C5C notification architecture", () => {
  it("creates an RLS-only, service-role-scoped, token-independent durable outbox", () => {
    expect(migration).toContain("CREATE TABLE notification_outbox");
    expect(migration).toContain("CREATE TABLE notification_delivery_attempts");
    expect(migration).toContain("ENABLE ROW LEVEL SECURITY");
    expect(migration).toContain("FOR UPDATE SKIP LOCKED");
    expect(migration).toContain("TO service_role");
    expect(migration).not.toMatch(/raw_token|review_url|credential/i);
    expect(migration).not.toMatch(/GRANT (?:SELECT|INSERT|UPDATE|DELETE).*notification_/i);
  });

  it("allows trusted RPC resolution without granting direct service-role table access", () => {
    expect(resolutionMigration).toContain("GRANT USAGE ON SCHEMA erp TO service_role");
    expect(resolutionMigration).toContain("REVOKE ALL ON TABLE");
    expect(resolutionMigration).not.toMatch(/GRANT (?:SELECT|INSERT|UPDATE|DELETE|ALL).*TABLE/i);
  });
  it("renders escaped versioned HTML and a plain-text fallback", () => {
    const email = renderNotificationTemplate(intent.type, intent.input);
    expect(email.html).toContain("&lt;Manager&gt;");
    expect(email.html).toContain("&lt;script&gt;");
    expect(email.html).not.toContain("<script>");
    expect(email.text).toContain("https://review.invalid/opaque");
    expect(email.subject).not.toMatch(/[\r\n]/);
  });

  it("claims once and records provider acceptance without exposing vendor types", async () => {
    const repository: NotificationDeliveryRepository = {
      create: vi.fn().mockResolvedValue("CREATED"),
      claim: vi.fn().mockResolvedValue(true),
      accepted: vi.fn(), failed: vi.fn(),
    };
    const provider: EmailDeliveryProvider = {
      name: "fake",
      send: vi.fn().mockResolvedValue({ accepted: true, provider: "fake", providerMessageId: "safe-message-id" }),
    };
    await expect(new NotificationDeliveryService(repository, provider, "UAT <sender@example.invalid>")
      .deliver(intent, "worker")).resolves.toEqual({
        status: "PROVIDER_ACCEPTED", providerMessageId: "safe-message-id",
      });
    expect(repository.accepted).toHaveBeenCalledWith(intent.id, "fake", "safe-message-id");
  });

  it("prevents duplicate workers from invoking the provider", async () => {
    const repository: NotificationDeliveryRepository = {
      create: vi.fn().mockResolvedValue("EXISTS"),
      claim: vi.fn().mockResolvedValueOnce(true).mockResolvedValueOnce(false),
      accepted: vi.fn(), failed: vi.fn(),
    };
    const provider: EmailDeliveryProvider = { name: "fake", send: vi.fn()
      .mockResolvedValue({ accepted: true, provider: "fake", providerMessageId: "message" }) };
    const service = new NotificationDeliveryService(repository, provider, "sender@example.invalid");
    const results = await Promise.all([service.deliver(intent, "a"), service.deliver(intent, "b")]);
    expect(results.map((result) => result.status).sort()).toEqual(["NOT_CLAIMED", "PROVIDER_ACCEPTED"]);
    expect(provider.send).toHaveBeenCalledTimes(1);
  });

  it.each([
    [429, "RateLimited"], [401, "AuthenticationFailure"], [403, "AuthenticationFailure"],
    [422, "InvalidRecipient"], [500, "TemporaryProviderFailure"], [418, "PermanentProviderRejection"],
  ])("classifies Resend HTTP %s", async (status, category) => {
    const fetcher = vi.fn().mockResolvedValue(new Response("{}", { status,
      headers: status === 429 ? { "retry-after": "2" } : undefined }));
    const provider = new ResendEmailDeliveryProvider({ apiKey: "server-only", timeoutMs: 50 }, fetcher);
    await expect(provider.send({ from: "a@b.test", to: "c@d.test", recipientName: "C",
      email: { subject: "s", text: "t", html: "<p>t</p>" }, idempotencyKey: "key" }))
      .resolves.toMatchObject({ accepted: false, category });
  });

  it("parses a successful provider message ID and sends both bodies", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: "provider-message" }), {
      status: 200, headers: { "content-type": "application/json" },
    }));
    const provider = new ResendEmailDeliveryProvider({ apiKey: "server-only" }, fetcher);
    await expect(provider.send({ from: "a@b.test", to: "delivered@resend.dev", recipientName: "C",
      email: { subject: "Unicode ✓", text: "plain ✓", html: "<p>html ✓</p>" }, idempotencyKey: "key" }))
      .resolves.toEqual({ accepted: true, provider: "resend", providerMessageId: "provider-message" });
    const body = JSON.parse(fetcher.mock.calls[0][1].body);
    expect(body).toMatchObject({ text: "plain ✓", html: "<p>html ✓</p>" });
    expect(fetcher.mock.calls[0][1].headers.authorization).not.toContain("VITE");
  });
});
