import type {
  EmailDeliveryProvider, EmailDeliveryRequest, EmailDeliveryResult,
} from "../../src/features/notifications/EmailDeliveryProvider";

export type FakeEmailMode =
  | "success" | "temporary-failure" | "rate-limited" | "timeout-before-acceptance"
  | "timeout-after-acceptance" | "invalid-recipient" | "authentication-failure"
  | "permanent-rejection" | "malformed-response";

export interface FakeEmailEvidence {
  readonly callCount: number;
  readonly acceptedMessageIds: readonly string[];
  readonly redactedCalls: readonly {
    to: string; subject: string; idempotencyKey: string; containsReviewUrl: boolean;
    containsPlaceholderHost: boolean;
  }[];
}

export class FakeEmailDeliveryProvider implements EmailDeliveryProvider {
  readonly name = "fake";
  private calls: FakeEmailEvidence["redactedCalls"][number][] = [];
  private acceptedIds: string[] = [];

  constructor(private mode: FakeEmailMode = "success") {}

  setMode(mode: FakeEmailMode): void { this.mode = mode; }

  evidence(): FakeEmailEvidence {
    return {
      callCount: this.calls.length,
      acceptedMessageIds: [...this.acceptedIds],
      redactedCalls: this.calls.map((call) => ({ ...call })),
    };
  }

  async send(request: EmailDeliveryRequest): Promise<EmailDeliveryResult> {
    const containsReviewUrl = /\/review\/(?:deur|manager)\//.test(`${request.email.text}\n${request.email.html}`);
    const containsPlaceholderHost = /(?:example|review)\.invalid/i
      .test(`${request.email.text}\n${request.email.html}`);
    this.calls.push({
      to: request.to, subject: request.email.subject,
      idempotencyKey: request.idempotencyKey, containsReviewUrl, containsPlaceholderHost,
    });
    const id = `fake-${request.idempotencyKey}-${this.calls.length}`;
    if (this.mode === "success" || this.mode === "timeout-after-acceptance") this.acceptedIds.push(id);
    switch (this.mode) {
      case "success": return { accepted: true, provider: this.name, providerMessageId: id };
      case "rate-limited": return { accepted: false, provider: this.name, category: "RateLimited", retryAfterSeconds: 1 };
      case "invalid-recipient": return { accepted: false, provider: this.name, category: "InvalidRecipient" };
      case "authentication-failure": return { accepted: false, provider: this.name, category: "AuthenticationFailure" };
      case "permanent-rejection": return { accepted: false, provider: this.name, category: "PermanentProviderRejection" };
      case "temporary-failure": return { accepted: false, provider: this.name, category: "TemporaryProviderFailure" };
      case "timeout-before-acceptance": return { accepted: false, provider: this.name, category: "Timeout" };
      case "timeout-after-acceptance": return { accepted: false, provider: this.name, category: "UnknownOutcome" };
      case "malformed-response": return { accepted: false, provider: this.name, category: "UnknownProviderFailure" };
    }
  }
}
