import type {
  EmailDeliveryProvider, EmailDeliveryRequest, EmailDeliveryResult,
} from "../../src/features/notifications/EmailDeliveryProvider";

export interface ResendProviderConfiguration {
  apiKey: string;
  endpoint?: string;
  timeoutMs?: number;
  uatRecipientOverride?: string;
}

export class ResendEmailDeliveryProvider implements EmailDeliveryProvider {
  readonly name = "resend";
  constructor(private readonly configuration: ResendProviderConfiguration, private readonly fetcher = fetch) {}

  async send(request: EmailDeliveryRequest, outerSignal?: AbortSignal): Promise<EmailDeliveryResult> {
    const from = request.from.trim();
    const to = (this.configuration.uatRecipientOverride ?? request.to).trim().toLowerCase();
    if (/[\r\n]/.test(`${from}${to}${request.recipientName}`) ||
      !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to) || from.length > 320) {
      return { accepted: false, provider: this.name, category: "InvalidRecipient" };
    }
    const uat = Boolean(this.configuration.uatRecipientOverride);
    const subject = `${uat ? "[UAT] " : ""}${request.email.subject}`.slice(0, 200);
    const text = uat ? `ISOLATED UAT TEST MESSAGE\n\n${request.email.text}` : request.email.text;
    const html = uat ? `<p><strong>ISOLATED UAT TEST MESSAGE</strong></p>${request.email.html}` : request.email.html;
    const controller = new AbortController();
    const abort = () => controller.abort();
    outerSignal?.addEventListener("abort", abort, { once: true });
    const timer = setTimeout(abort, this.configuration.timeoutMs ?? 10_000);
    try {
      const response = await this.fetcher(this.configuration.endpoint ?? "https://api.resend.com/emails", {
        method: "POST",
        signal: controller.signal,
        headers: {
          authorization: `Bearer ${this.configuration.apiKey}`,
          "content-type": "application/json",
          "idempotency-key": request.idempotencyKey,
          "user-agent": "equipment-rental-notifications/1.0",
        },
        body: JSON.stringify({
          from, to: [to], subject, html, text,
        }),
      });
      const data = await response.json().catch(() => null) as { id?: unknown } | null;
      if (response.ok && typeof data?.id === "string" && data.id.length <= 200) {
        return { accepted: true, provider: this.name, providerMessageId: data.id };
      }
      if (response.status === 429) {
        const retry = Number(response.headers.get("retry-after"));
        return { accepted: false, provider: this.name, category: "RateLimited",
          ...(Number.isFinite(retry) ? { retryAfterSeconds: retry } : {}) };
      }
      if (response.status === 401 || response.status === 403) {
        return { accepted: false, provider: this.name, category: "AuthenticationFailure" };
      }
      if (response.status === 400 || response.status === 422) {
        return { accepted: false, provider: this.name, category: "InvalidRecipient" };
      }
      return { accepted: false, provider: this.name,
        category: response.status >= 500 ? "TemporaryProviderFailure" : "PermanentProviderRejection" };
    } catch (error) {
      return { accepted: false, provider: this.name,
        category: error instanceof DOMException && error.name === "AbortError" ? "Timeout" : "UnknownProviderFailure" };
    } finally {
      clearTimeout(timer);
      outerSignal?.removeEventListener("abort", abort);
    }
  }
}
