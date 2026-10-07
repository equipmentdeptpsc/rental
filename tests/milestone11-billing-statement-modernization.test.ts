import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { EmailDeliveryProvider } from "@/features/notifications/EmailDeliveryProvider";
import { sendBillingStatementEmail } from "@/features/rental/billing-email/sendBillingStatementEmail";
import type { BillingStatement } from "@/features/rental/billingstatement/types";
import { buildInvoiceDocument } from "@/features/rental/workspace/invoice/InvoiceDocumentBuilder";
import InvoiceDocumentView from "@/features/rental/workspace/invoice/InvoiceDocumentView";
import { billingStatementPdfText } from "@/features/rental/billing-email/generateBillingStatementPdf";

const statement: BillingStatement = {
  id: "internal-statement-uuid", statementNo: "BS-2026-00125", version: 1,
  rentalId: "internal-rental-uuid", rentalNumber: "RNT-2026-0045", equipmentId: "equipment-uuid", operatorId: "operator-uuid",
  customer: "ABC Construction", customerRepresentativeName: "Customer Lead", customerRepresentativeEmail: "billing@example.test", project: "Project Alpha",
  billingFrom: "2026-08-20", billingTo: "2026-08-21", subtotal: 320, grandTotal: 320,
  approvalStatus: "Approved", invoiceStatus: "Partially Collected", createdBy: "Finance", createdAt: "2026-08-21T08:00:00Z",
  lines: [{ id: "line-uuid", deurId: "deur-uuid", deurReference: "DEUR-2026-00125", rentalEquipmentLineId: "rental-line-uuid", equipmentId: "equipment-uuid", operatorId: "operator-uuid", equipmentSnapshot: { id: "equipment-uuid", assetNo: "EXC-001", name: "CAT 320 Excavator" }, equipmentLabel: "CAT 320 Excavator (EXC-001)", operatorLabel: "Operator One", workDate: "2026-08-21", description: "Operating Hours", costCode: "RENT", activityCode: "OPER", billingMethod: "Per Hour", hours: 2, hourlyRate: 100, amount: 320, operatingCharge: 200, idleHours: 0.5, idleCharge: 50, mobilizationCharge: 20, fuelCharge: 50, grandTotal: 320 }],
};

describe("Milestone 11 Billing Statement modernization", () => {
  it("uses frozen DEUR code evidence when an older statement line lacks activity and cost snapshots", () => {
    const legacy = { ...statement, lines: statement.lines.map((line) => ({ ...line, activityCode: undefined, costCode: "" })) };
    const document = buildInvoiceDocument(legacy, [], [], "PHP", undefined, [{ id: "deur-uuid", operationalMetadata: { activityCode: { code: "ACT-1" }, costCode: { code: "CC-1" } } } as never]);
    expect(document.serviceLines[0]).toMatchObject({ activityCode: "ACT-1", costCode: "CC-1" });
  });
  it("projects DEUR-derived operating and idle charges into normal traceable service rows", () => {
    const document = buildInvoiceDocument(statement, [], [], "PHP", { amountCollected: 100, outstandingBalance: 220 });
    expect(document.serviceLines).toEqual(expect.arrayContaining([
      expect.objectContaining({ deurReference: "DEUR-2026-00125", service: "Operation — Operating Hours", quantityLabel: "2.00 hr", rate: 100, amount: 200 }),
      expect.objectContaining({ deurReference: "DEUR-2026-00125", service: "Idle Hours", quantityLabel: "0.50 hr", rate: 100, amount: 50 }),
      expect.objectContaining({ deurReference: "DEUR-2026-00125", service: "Mobilization", amount: 20 }),
      expect.objectContaining({ deurReference: "DEUR-2026-00125", service: "Fuel Charge", amount: 50 }),
    ]));
    expect(document.serviceLines.reduce((sum, line) => sum + line.amount, 0)).toBe(document.subtotal);
    expect(document.serviceLines[0]).toMatchObject({ equipmentCode: "EXC-001", activityCode: "OPER", costCode: "RENT" });
    const html = renderToStaticMarkup(createElement(InvoiceDocumentView, { document }));
    expect(html).toContain("DEUR No."); expect(html).toContain("Idle Hours"); expect(html).toContain("OUTSTANDING AMOUNT");
    expect(html).toContain("Equipment Code"); expect(html).toContain("Activity Code"); expect(html).toContain("Cost Code");
    expect(billingStatementPdfText(document).join("\n")).toContain("EXC-001 | CAT 320 Excavator");
    expect(html).not.toMatch(/internal-statement-uuid|internal-rental-uuid|deur-uuid|equipment-uuid/);
  });

  it("attaches the current canonical PDF and reports provider success", async () => {
    const document = buildInvoiceDocument(statement, [], [], "PHP", { amountCollected: 100, outstandingBalance: 220 });
    const send = vi.fn().mockResolvedValue({ accepted: true, provider: "fake", providerMessageId: "message-1" });
    const provider: EmailDeliveryProvider = { name: "fake", send };
    await expect(sendBillingStatementEmail({ document, provider, from: "sender@example.test", idempotencyKey: "statement-BS-2026-00125-v1" })).resolves.toEqual({ success: true, provider: "fake", providerMessageId: "message-1" });
    expect(send).toHaveBeenCalledWith(expect.objectContaining({ to: "billing@example.test", attachments: [expect.objectContaining({ filename: "Billing-Statement-BS-2026-00125.pdf", contentType: "application/pdf", contentBase64: expect.any(String) })] }));
    expect(send.mock.calls[0][0].email.subject).toBe("Billing Statement BS-2026-00125 — Rental RNT-2026-0045");
    expect(send.mock.calls[0][0].email.text).toContain("Outstanding Amount: PHP 220.00");
  });

  it("does not call the provider when PDF generation fails", async () => {
    const document = buildInvoiceDocument(statement);
    const send = vi.fn(); const provider: EmailDeliveryProvider = { name: "fake", send };
    await expect(sendBillingStatementEmail({ document, provider, from: "sender@example.test", idempotencyKey: "stable", pdfGenerator: () => { throw new Error("failed"); } })).resolves.toMatchObject({ success: false, code: "PDF_GENERATION_FAILED" });
    expect(send).not.toHaveBeenCalled();
  });
});
