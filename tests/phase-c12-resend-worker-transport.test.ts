import { afterEach, describe, expect, it, vi } from "vitest";
import { ResendEmailDeliveryProvider } from "../server/notifications/ResendEmailDeliveryProvider";
import { decideNotificationFailure } from "../server/notifications/NotificationRetryPolicy";
import { TrustedNotificationWorker, type ClaimedNotification,
  type TrustedNotificationWorkerRepository } from "../server/notifications/TrustedNotificationWorker";

const request = {
  from: "sender@example.invalid", to: "recipient@example.invalid", recipientName: "Recipient",
  email: { subject: "Subject", text: "Text", html: "<p>Text</p>" }, idempotencyKey: "stable-provider-key",
};

afterEach(() => vi.unstubAllGlobals());

describe("C12.2.7E.3 provider-safe Worker transport", () => {
  it("uses a Worker-safe global fetch wrapper and preserves provider idempotency", async () => {
    const fetcher = vi.fn(function (this: unknown, _input: RequestInfo | URL, init?: RequestInit) {
      if (this !== globalThis) throw new TypeError("Illegal invocation: incorrect this reference");
      expect(new Headers(init?.headers).get("idempotency-key")).toBe(request.idempotencyKey);
      return Promise.resolve(new Response(JSON.stringify({ id: "synthetic-message-id" }), { status: 200 }));
    });
    vi.stubGlobal("fetch", fetcher);
    await expect(new ResendEmailDeliveryProvider({ apiKey: "synthetic-key" }).send(request))
      .resolves.toEqual({ accepted: true, provider: "resend", providerMessageId: "synthetic-message-id" });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it.each([
    [429, "RateLimited", true], [500, "TemporaryProviderFailure", true],
    [401, "AuthenticationFailure", false], [418, "PermanentProviderRejection", false],
  ] as const)("classifies HTTP %s without reading or returning the provider body", async (status, category, retryable) => {
    const provider = new ResendEmailDeliveryProvider({ apiKey: "synthetic-key" }, vi.fn().mockResolvedValue(
      new Response("provider body must remain opaque", { status }),
    ));
    await expect(provider.send(request)).resolves.toMatchObject({ accepted: false, category,
      diagnostic: { deliveryOutcome: "KNOWN_PROVIDER_RESPONSE", retryable, httpStatus: status } });
  });

  it("classifies malformed success responses as conservative unknown delivery outcomes", async () => {
    const provider = new ResendEmailDeliveryProvider({ apiKey: "synthetic-key" }, vi.fn().mockResolvedValue(
      new Response("not-json", { status: 200 }),
    ));
    await expect(provider.send(request)).resolves.toMatchObject({ accepted: false, category: "ProviderParseError",
      diagnostic: { deliveryOutcome: "UNKNOWN_DELIVERY_OUTCOME", retryable: false, httpStatus: 200 } });
  });

  it.each([
    [new TypeError("Illegal invocation: incorrect this reference"), "FetchBindingError", "KNOWN_PRE_SEND_FAILURE", true],
    [new TypeError("network connection reset"), "NetworkException", "UNKNOWN_DELIVERY_OUTCOME", false],
    [new Error("opaque provider exception"), "ProviderUnknownError", "UNKNOWN_DELIVERY_OUTCOME", false],
  ] as const)("classifies a safe %s exception", async (error, category, deliveryOutcome, retryable) => {
    const provider = new ResendEmailDeliveryProvider({ apiKey: "synthetic-key" }, vi.fn().mockRejectedValue(error));
    await expect(provider.send(request)).resolves.toMatchObject({ accepted: false, category,
      diagnostic: { deliveryOutcome, retryable, exceptionName: error.name } });
  });

  it("classifies abort after dispatch as an unknown outcome that is not retried", async () => {
    const provider = new ResendEmailDeliveryProvider({ apiKey: "synthetic-key" }, vi.fn().mockRejectedValue(
      new DOMException("aborted", "AbortError"),
    ));
    const result = await provider.send(request);
    expect(result).toMatchObject({ accepted: false, category: "UnknownOutcome",
      diagnostic: { deliveryOutcome: "UNKNOWN_DELIVERY_OUTCOME", retryable: false, exceptionName: "AbortError" } });
    expect(decideNotificationFailure("UnknownOutcome", false, 1)).toEqual({ status: "UnknownOutcome", retryable: false });
  });

  it.each(["NetworkException", "ProviderParseError", "ProviderUnknownError"] as const)(
    "prevents automatic retry for %s",
    category => expect(decideNotificationFailure(category, false, 1))
      .toEqual({ status: "UnknownOutcome", retryable: false }),
  );

  it("allows a proven pre-send fetch binding failure to remain bounded-retryable", () => {
    expect(decideNotificationFailure("FetchBindingError", false, 1))
      .toMatchObject({ status: "Failed", retryable: true });
  });

  it("rejects invalid endpoint construction before transport", async () => {
    const fetcher = vi.fn();
    await expect(new ResendEmailDeliveryProvider({ apiKey: "synthetic-key", endpoint: "://invalid" }, fetcher)
      .send(request)).resolves.toMatchObject({ accepted: false, category: "InvalidRequestConstruction",
        diagnostic: { deliveryOutcome: "KNOWN_PRE_SEND_FAILURE", retryable: true } });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("logs only safe outcome metadata and maps unknown transport to a non-retryable state", async () => {
    const intent: ClaimedNotification = { id: "notification-id", companyId: "tenant",
      type: "CUSTOMER_GROUPED_REVIEW_REQUESTED", recipient: { destination: "private@example.invalid", displayName: "Private" },
      sourceAggregateType: "CUSTOMER_REVIEW_BATCH", sourceAggregateId: "batch", templateVersion: 1,
      idempotencyKey: "stable-key", attempt: 1, requiresReviewCredential: true,
      input: { recipientName: "Private", companyName: "Company", rentalReference: "R-1" } };
    const completions: Array<Record<string, unknown>> = [];
    const repository: TrustedNotificationWorkerRepository = {
      claimBatch: async () => [intent],
      resolveGroupedReviewDelivery: async () => ({ status: "ACTIVE", reviewPath: "/review/customer/grouped/" + "a".repeat(64) }),
      complete: async input => { completions.push(input); },
    };
    const events: Record<string, unknown>[] = [];
    const provider = new ResendEmailDeliveryProvider({ apiKey: "synthetic-secret" },
      vi.fn().mockRejectedValue(new TypeError("network connection reset")));
    await new TrustedNotificationWorker(repository, provider, "sender@example.invalid", 1,
      "https://uat.example.test", { log: event => events.push(event) })
      .runOnce("00000000-0000-4000-8000-000000000001");
    expect(completions).toEqual([expect.objectContaining({ status: "UnknownOutcome", failureCategory: "NetworkException" })]);
    expect(events).toEqual([expect.objectContaining({ provider: "resend", outcomeCategory: "NetworkException",
      deliveryOutcome: "UNKNOWN_DELIVERY_OUTCOME", retryable: false, attempt: 1, exceptionName: "TypeError" })]);
    const output = JSON.stringify(events);
    for (const forbidden of ["synthetic-secret", "private@example.invalid", "/review/", "stable-key", "<p>"])
      expect(output).not.toContain(forbidden);
  });
});
