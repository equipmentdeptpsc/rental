import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { buildInvoiceDocument } from "@/features/rental/workspace/invoice/InvoiceDocumentBuilder";
import InvoiceDocumentView from "@/features/rental/workspace/invoice/InvoiceDocumentView";
import type { BillingStatement, BillingStatementLine } from "@/features/rental/billingstatement/types";

function line(id: string, equipmentId: string, amount: number, rate: number, method = "Per Hour", extras: Partial<BillingStatementLine> = {}): BillingStatementLine {
  return { id, deurId: `deur-${id}`, rentalEquipmentLineId: `line-${id}`, equipmentId, operatorId: `operator-${id}`, workDate: "2026-07-02", shift: "Day", description: `Rental ${id}`, costCode: "CC-1", billingMethod: method, hours: 2, hourlyRate: rate, operatingCharge: amount, idleCharge: 0, mobilizationCharge: 0, demobilizationCharge: 0, operatorCharge: 0, fuelCharge: 0, amount, vat: amount * 0.12, withholdingTax: amount * 0.02, grandTotal: amount * 1.1, ...extras };
}
function statement(lines: BillingStatementLine[]): BillingStatement {
  return { id: "statement-1", statementNo: "BS-1", version: 1, rentalId: "rental-1", equipmentId: "", operatorId: "", customer: "Customer", project: "Project", billingFrom: "2026-07-01", billingTo: "2026-07-31", subtotal: lines.reduce((sum, item) => sum + item.amount, 0), vat: lines.reduce((sum, item) => sum + (item.vat ?? 0), 0), withholdingTax: lines.reduce((sum, item) => sum + (item.withholdingTax ?? 0), 0), grandTotal: lines.reduce((sum, item) => sum + (item.grandTotal ?? item.amount), 0), approvalStatus: "Approved", invoiceStatus: "Invoiced", lines, createdBy: "System", createdAt: "2026-07-03T00:00:00.000Z" };
}

describe("multi-equipment invoice document", () => {
  it("projects every persisted statement value and identity without recalculation", () => {
    const source = statement([line("1", "equipment-1", 200, 100), line("2", "equipment-2", 750, 250, "Per Day", { hours: 3, mobilizationCharge: 50 })]);
    const document = buildInvoiceDocument(source, [{ id: "equipment-1", prefixId: "", assetNo: "EX-01", equipmentName: "Excavator", category: "Moving Equipment", maintenanceType: "Engine Hours", currentReading: 0, projectId: "", operatorId: "", status: "Rented" }, { id: "equipment-2", prefixId: "", assetNo: "CR-02", equipmentName: "Crane", category: "Moving Equipment", maintenanceType: "Engine Hours", currentReading: 0, projectId: "", operatorId: "", status: "Rented" }]);
    expect(document.lines).toHaveLength(2);
    expect(document.lines[1]).toMatchObject({ rentalEquipmentLineId: "line-2", equipmentId: "equipment-2", deurId: "deur-2", billingMethod: "Per Day", hourlyRate: 250, amount: 750, equipmentLabel: "Crane (CR-02)" });
    expect(document.lines[0].optionalCharges).toEqual([]);
    expect(document.lines[1].optionalCharges).toEqual([{ label: "Mobilization", amount: 50 }]);
    expect(document).toMatchObject({ subtotal: source.subtotal, vat: source.vat, withholdingTax: source.withholdingTax, grandTotal: source.grandTotal, warnings: [] });
  });

  it("renders every equipment row, mixed methods, non-zero charges, and print control", () => {
    const document = buildInvoiceDocument(statement([line("1", "equipment-1", 200, 100), line("2", "equipment-2", 300, 300, "One Lot", { fuelCharge: 25 })]));
    const html = renderToStaticMarkup(createElement(InvoiceDocumentView, { document }));
    expect(html).toContain("Equipment record unavailable"); expect(html).not.toContain("equipment-1"); expect(html).not.toContain("equipment-2"); expect(html).toContain("Per Hour"); expect(html).toContain("One Lot"); expect(html).toContain("Fuel:"); expect(html).not.toContain("Mobilization:"); expect(html).toContain("Print");
  });

  it("keeps a legacy header-only document readable without fabricating detail", () => {
    const legacy = statement([]); legacy.equipmentId = "legacy-equipment"; legacy.subtotal = 500; legacy.grandTotal = 500;
    const document = buildInvoiceDocument(legacy);
    expect(document.lines).toEqual([]); expect(document.subtotal).toBe(500); expect(document.warnings).toContainEqual(expect.objectContaining({ code: "LEGACY_HEADER_ONLY" }));
  });

  it("surfaces structured identity and reconciliation warnings without modifying totals", () => {
    const inconsistent = statement([line("1", "equipment-1", 200, 100)]); inconsistent.subtotal = 201; inconsistent.vat = 99; inconsistent.withholdingTax = 88; inconsistent.grandTotal = 777; inconsistent.lines[0].rentalEquipmentLineId = undefined;
    const document = buildInvoiceDocument(inconsistent);
    expect(document.warnings.map((warning) => warning.code)).toEqual(expect.arrayContaining(["LINE_IDENTITY_INCOMPLETE", "SUBTOTAL_MISMATCH", "VAT_MISMATCH", "WITHHOLDING_MISMATCH", "GRAND_TOTAL_MISMATCH"]));
    expect(document).toMatchObject({ subtotal: 201, vat: 99, withholdingTax: 88, grandTotal: 777 });
  });
});
