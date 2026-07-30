import { describe, expect, it } from "vitest";
import { ResendEmailDeliveryProvider } from "../server/notifications/ResendEmailDeliveryProvider";

const enabled = process.env.RUN_RESEND_READBACK_PROBE === "true";

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required server-only probe configuration: ${name}`);
  return value;
}

describe.skipIf(!enabled)("Resend isolated send-and-readback authorization probe", () => {
  it("sends one harmless message and retrieves that exact provider message", async () => {
    const sendKey = required("RESEND_API_KEY");
    const readbackKey = required("RESEND_READBACK_API_KEY");
    const from = required("RESEND_FROM_ADDRESS");
    const controlledRecipient = required("EMAIL_UAT_RECIPIENT_OVERRIDE");

    const provider = new ResendEmailDeliveryProvider({
      apiKey: sendKey,
      uatRecipientOverride: controlledRecipient,
      timeoutMs: 15_000,
    });
    const sent = await provider.send({
      from,
      to: controlledRecipient,
      recipientName: "Controlled UAT Recipient",
      idempotencyKey: `resend-readback-probe-${crypto.randomUUID()}`,
      email: {
        subject: "Isolated UAT readback authorization probe",
        text: "Harmless static certification message. No review credential is present.",
        html: "<p>Harmless static certification message. No review credential is present.</p>",
      },
    });
    expect(sent.accepted).toBe(true);
    if (!sent.accepted) throw new Error(`Probe send was not accepted (${sent.category}).`);

    const response = await fetch(`https://api.resend.com/emails/${sent.providerMessageId}`, {
      headers: { Authorization: `Bearer ${readbackKey}` },
    });
    if (response.status === 401 || response.status === 403) {
      console.log(JSON.stringify({
        httpStatus: response.status,
        returnedIdMatches: false,
        toPresent: false,
        fromPresent: false,
        subjectPresent: false,
        lastEventPresent: false,
        htmlOrTextPresent: false,
      }));
      expect(response.status).toBe(200);
      return;
    }

    const message = await response.json() as {
      id?: unknown; to?: unknown; from?: unknown; subject?: unknown;
      last_event?: unknown; html?: unknown; text?: unknown;
    };
    const evidence = {
      httpStatus: response.status,
      returnedIdMatches: message.id === sent.providerMessageId,
      toPresent: Array.isArray(message.to) && message.to.length > 0,
      fromPresent: typeof message.from === "string" && message.from.length > 0,
      subjectPresent: typeof message.subject === "string" && message.subject.length > 0,
      lastEventPresent: typeof message.last_event === "string" && message.last_event.length > 0,
      htmlOrTextPresent:
        (typeof message.html === "string" && message.html.length > 0)
        || (typeof message.text === "string" && message.text.length > 0),
    };
    console.log(JSON.stringify(evidence));
    expect(evidence).toEqual({
      httpStatus: 200,
      returnedIdMatches: true,
      toPresent: true,
      fromPresent: true,
      subjectPresent: true,
      lastEventPresent: true,
      htmlOrTextPresent: true,
    });
  }, 30_000);
});
