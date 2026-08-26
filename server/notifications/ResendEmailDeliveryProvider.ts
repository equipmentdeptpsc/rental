import type {
  EmailDeliveryProvider, EmailDeliveryRequest, EmailDeliveryResult,
} from "../../src/features/notifications/EmailDeliveryProvider";

export interface ResendProviderConfiguration {
  apiKey: string;
  endpoint?: string;
  timeoutMs?: number;
  uatRecipientOverride?: string;
}

export type ResendAuthenticationResult = "VALID" | "INVALID" | "UNAVAILABLE";

/** Performs a read-only authentication probe. A send-only key is valid even though
 * Resend intentionally rejects the domains endpoint with restricted_api_key. */
export async function verifyResendAuthentication(
  apiKey: string,
  fetcher: typeof fetch = globalThis.fetch,
): Promise<ResendAuthenticationResult> {
  try {
    const response = await fetcher("https://api.resend.com/domains?limit=1", {
      method: "GET",
      headers: { authorization: `Bearer ${apiKey}`, "user-agent": "equipment-rental-notifications/1.0" },
    });
    if (response.ok) return "VALID";
    let code: unknown;
    try { code = ((await response.json()) as { name?: unknown }).name; } catch { return "UNAVAILABLE"; }
    if (response.status === 401 && code === "restricted_api_key") return "VALID";
    if ((response.status === 401 || response.status === 403) && code === "invalid_api_key") return "INVALID";
    return "UNAVAILABLE";
  } catch { return "UNAVAILABLE"; }
}

export class ResendEmailDeliveryProvider implements EmailDeliveryProvider {
  readonly name = "resend";
  private readonly fetcher: typeof fetch;
  constructor(private readonly configuration: ResendProviderConfiguration, fetcher?: typeof fetch) {
    this.fetcher = fetcher ?? ((input, init) => globalThis.fetch(input, init));
  }

  async send(request: EmailDeliveryRequest, outerSignal?: AbortSignal): Promise<EmailDeliveryResult> {
    const from = request.from.trim();
    const to = (this.configuration.uatRecipientOverride ?? request.to).trim().toLowerCase();
    if (/[\r\n]/.test(`${from}${to}${request.recipientName}`) ||
      !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to) || from.length > 320) {
      return { accepted: false, provider: this.name, category: "InvalidRecipient",
        diagnostic: { deliveryOutcome: "KNOWN_PRE_SEND_FAILURE", retryable: false } };
    }
    const uat = Boolean(this.configuration.uatRecipientOverride);
    const subject = `${uat ? "[UAT] " : ""}${request.email.subject}`.slice(0, 200);
    const text = uat ? `ISOLATED UAT TEST MESSAGE\n\n${request.email.text}` : request.email.text;
    const html = uat ? `<p><strong>ISOLATED UAT TEST MESSAGE</strong></p>${request.email.html}` : request.email.html;
    try { new URL(this.configuration.endpoint ?? "https://api.resend.com/emails"); }
    catch {
      return { accepted: false, provider: this.name, category: "InvalidRequestConstruction",
        diagnostic: { deliveryOutcome: "KNOWN_PRE_SEND_FAILURE", retryable: true, exceptionName: "TypeError" } };
    }
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
          ...(request.attachments?.length ? { attachments: request.attachments.map(attachment => ({ filename: attachment.filename, content: attachment.contentBase64, content_type: attachment.contentType })) } : {}),
        }),
      });
      if (response.status === 429) {
        const retry = Number(response.headers.get("retry-after"));
        return { accepted: false, provider: this.name, category: "RateLimited",
          ...(Number.isFinite(retry) ? { retryAfterSeconds: retry } : {}),
          diagnostic: { deliveryOutcome: "KNOWN_PROVIDER_RESPONSE", retryable: true, httpStatus: response.status } };
      }
      if (response.status === 401 || response.status === 403) {
        return { accepted: false, provider: this.name, category: "AuthenticationFailure",
          diagnostic: { deliveryOutcome: "KNOWN_PROVIDER_RESPONSE", retryable: false, httpStatus: response.status } };
      }
      if (response.status === 400 || response.status === 422) {
        return { accepted: false, provider: this.name, category: "InvalidRecipient",
          diagnostic: { deliveryOutcome: "KNOWN_PROVIDER_RESPONSE", retryable: false, httpStatus: response.status } };
      }
      if (!response.ok) {
        const retryable = response.status >= 500;
        return { accepted: false, provider: this.name,
          category: retryable ? "TemporaryProviderFailure" : "PermanentProviderRejection",
          diagnostic: { deliveryOutcome: "KNOWN_PROVIDER_RESPONSE", retryable, httpStatus: response.status } };
      }
      let data: { id?: unknown } | null;
      try { data = await response.json() as { id?: unknown } | null; }
      catch {
        return { accepted: false, provider: this.name, category: "ProviderParseError",
          diagnostic: { deliveryOutcome: "UNKNOWN_DELIVERY_OUTCOME", retryable: false,
            exceptionName: "SyntaxError", httpStatus: response.status } };
      }
      if (typeof data?.id === "string" && data.id.length <= 200) {
        return { accepted: true, provider: this.name, providerMessageId: data.id };
      }
      return { accepted: false, provider: this.name, category: "ProviderParseError",
        diagnostic: { deliveryOutcome: "UNKNOWN_DELIVERY_OUTCOME", retryable: false, httpStatus: response.status } };
    } catch (error) {
      const exceptionName = error instanceof DOMException ? error.name : error instanceof Error ? error.name : "Unknown";
      if (error instanceof DOMException && error.name === "AbortError") {
        return { accepted: false, provider: this.name, category: "UnknownOutcome",
          diagnostic: { deliveryOutcome: "UNKNOWN_DELIVERY_OUTCOME", retryable: false, exceptionName } };
      }
      if (error instanceof TypeError && /this|invocation/i.test(error.message)) {
        return { accepted: false, provider: this.name, category: "FetchBindingError",
          diagnostic: { deliveryOutcome: "KNOWN_PRE_SEND_FAILURE", retryable: true, exceptionName } };
      }
      if (error instanceof TypeError) {
        return { accepted: false, provider: this.name, category: "NetworkException",
          diagnostic: { deliveryOutcome: "UNKNOWN_DELIVERY_OUTCOME", retryable: false, exceptionName } };
      }
      return { accepted: false, provider: this.name, category: "ProviderUnknownError",
        diagnostic: { deliveryOutcome: "UNKNOWN_DELIVERY_OUTCOME", retryable: false, exceptionName } };
    } finally {
      clearTimeout(timer);
      outerSignal?.removeEventListener("abort", abort);
    }
  }
}
