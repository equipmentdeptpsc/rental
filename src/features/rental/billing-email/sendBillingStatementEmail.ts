import type { EmailDeliveryProvider, EmailDeliveryResult } from "@/features/notifications/EmailDeliveryProvider";
import type { InvoiceDocument } from "@/features/rental/workspace/invoice/InvoiceDocumentBuilder";
import { buildBillingStatementEmail } from "./buildBillingStatementEmail";
import { generateBillingStatementPdf } from "./generateBillingStatementPdf";

export type BillingStatementEmailResult =
  | { success: true; provider: string; providerMessageId: string }
  | { success: false; code: "RECIPIENT_REQUIRED" | "PDF_GENERATION_FAILED" | "DELIVERY_FAILED"; message: string; delivery?: EmailDeliveryResult };

function base64(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

export async function sendBillingStatementEmail(input: {
  document: InvoiceDocument;
  provider: EmailDeliveryProvider;
  from: string;
  idempotencyKey: string;
  preparedBy?: string;
  logoPng?: Uint8Array;
  pdfGenerator?: typeof generateBillingStatementPdf;
}): Promise<BillingStatementEmailResult> {
  const recipient = input.document.customerRepresentativeEmail?.trim() ?? "";
  if (!recipient) return { success: false, code: "RECIPIENT_REQUIRED", message: "Customer billing email is not available." };
  let pdf: Uint8Array;
  try { pdf = (input.pdfGenerator ?? generateBillingStatementPdf)(input.document, input.preparedBy, input.logoPng); }
  catch { return { success: false, code: "PDF_GENERATION_FAILED", message: "Unable to generate the Billing Statement PDF." }; }
  const snapshot = buildBillingStatementEmail({ statementNumber: input.document.statementNo, rentalNumber: input.document.rentalNumber, customer: input.document.customer, representativeName: input.document.customerRepresentativeName ?? "Customer Representative", recipient, project: input.document.project, billingFrom: input.document.billingFrom, billingTo: input.document.billingTo, amountDue: input.document.grandTotal, outstandingAmount: input.document.outstandingBalance, currency: input.document.currency });
  const delivery = await input.provider.send({
    from: input.from, to: recipient, recipientName: input.document.customerRepresentativeName ?? "Customer Representative",
    idempotencyKey: input.idempotencyKey,
    email: { subject: snapshot.subject, text: snapshot.body, html: `<p>${snapshot.body.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll("\n", "<br>")}</p>` },
    attachments: [{ filename: `Billing-Statement-${input.document.statementNo}.pdf`, contentType: "application/pdf", contentBase64: base64(pdf) }],
  });
  return delivery.accepted
    ? { success: true, provider: delivery.provider, providerMessageId: delivery.providerMessageId }
    : { success: false, code: "DELIVERY_FAILED", message: "Unable to send Billing Statement.", delivery };
}
