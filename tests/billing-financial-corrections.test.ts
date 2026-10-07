import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { BillingRateEngine, type BillingCalculationTerms } from "@/features/rental/billing/engine";
import type { DeurRecord } from "@/features/rental/deur/types";
import type { BillingStatement } from "@/features/rental/billingstatement/types";
import { buildInvoiceDocument } from "@/features/rental/workspace/invoice/InvoiceDocumentBuilder";
import InvoiceDocumentView from "@/features/rental/workspace/invoice/InvoiceDocumentView";
import { billingStatementPdfText } from "@/features/rental/billing-email/generateBillingStatementPdf";

const deur = (operating = 120, idle = 60, standby = 30): DeurRecord => ({
  id: "deur-internal-id", rentalId: "rental-internal-id", equipmentId: "equipment-internal-id", operatorId: "operator-internal-id",
  workDate: "2026-10-01", status: "Acknowledged", legacy: false, logs: [], events: [],
  totalOperatingMinutes: operating, totalIdleMinutes: idle, totalStandbyMinutes: standby,
  totalMealBreakMinutes: 60, totalMobilizationMinutes: 0, totalDemobilizationMinutes: 0,
  totalMaintenanceMinutes: 0, createdAt: "2026-10-01", updatedAt: "2026-10-01",
} as DeurRecord);
const terms = (change: Partial<BillingCalculationTerms> = {}): BillingCalculationTerms => ({ billingMethod: "Per Hour", unitRate: 100, operatorIncluded: true, vatApplicability: "Not Applicable", ...change });

describe("separate canonical financial components", () => {
  it("bills Operation only when Idle has no commercial rate", () => {
    expect(BillingRateEngine.calculate(deur(), terms())).toMatchObject({ operatingCharge: 200, idleCharge: 0, standbyCharge: 0, subtotal: 200 });
  });
  it("allows Idle billing without an Operation charge", () => {
    expect(BillingRateEngine.calculate(deur(), terms({ unitRate: 0, idleRate: 40 }))).toMatchObject({ operatingCharge: 0, idleCharge: 40, subtotal: 40 });
  });
  it("uses independent Operation, Idle, and Standby quantities and rates", () => {
    expect(BillingRateEngine.calculate(deur(), terms({ idleRate: 40, standbyRate: 30 }))).toMatchObject({ operatingHours: 2, idleHours: 1, standbyHours: .5, operatingCharge: 200, idleCharge: 40, standbyCharge: 15, subtotal: 255 });
  });
  it("never maps Standby minutes or its rate to Idle", () => {
    expect(BillingRateEngine.calculate(deur(0, 0, 60), terms({ unitRate: 0, idleRate: 40, standbyRate: 30 }))).toMatchObject({ idleCharge: 0, standbyCharge: 30 });
  });
  it("keeps Meal Break and End Shift outside financial quantities", () => {
    expect(BillingRateEngine.calculate(deur(0, 0, 0), terms())).toMatchObject({ operatingCharge: 0, idleCharge: 0, standbyCharge: 0, subtotal: 0 });
  });
  it.each([
    { type: "NONE" as const, value: 0, vat: "Not Applicable" as const, discount: 0, tax: 0, total: 200 },
    { type: "PERCENTAGE" as const, value: 10, vat: "Not Applicable" as const, discount: 20, tax: 0, total: 180 },
    { type: "FIXED_AMOUNT" as const, value: 30, vat: "Not Applicable" as const, discount: 30, tax: 0, total: 170 },
    { type: "PERCENTAGE" as const, value: 10, vat: "Applicable" as const, discount: 20, tax: 21.6, total: 201.6 },
    { type: "FIXED_AMOUNT" as const, value: 30, vat: "Applicable" as const, discount: 30, tax: 20.4, total: 190.4 },
  ])("applies $type discount to the taxable base when VAT is $vat", ({ type, value, vat, discount, tax, total }) => {
    expect(BillingRateEngine.calculate(deur(), terms({ discountType: type, discountValue: value, vatApplicability: vat, taxRate: 12 }))).toMatchObject({ subtotal: 200, discountAmount: discount, subtotalAfterDiscount: 200 - discount, vat: tax, grandTotal: total });
  });
  it("rejects a percentage above 100", () => {
    expect(() => BillingRateEngine.calculate(deur(), terms({ discountType: "PERCENTAGE", discountValue: 101 }))).toThrow(RangeError);
  });
});

const statement = (discountAmount = 0, vatApplicable = false): BillingStatement => ({
  id: "statement-internal-id", statementNo: "BS-2026-010", version: 1, rentalId: "rental-internal-id", rentalNumber: "R-010",
  equipmentId: "equipment-internal-id", operatorId: "operator-internal-id", customer: "Customer", project: "Project",
  billingFrom: "2026-10-01", billingTo: "2026-10-01", subtotal: 240, discountAmount,
  subtotalBeforeDiscount: 240, subtotalAfterDiscount: 240-discountAmount, vatApplicable,
  vat: vatApplicable ? (240-discountAmount)*.12 : 0, grandTotal: vatApplicable ? (240-discountAmount)*1.12 : 240-discountAmount,
  approvalStatus: "Approved", invoiceStatus: "Invoiced", createdBy: "Finance", createdAt: "2026-10-02T00:00:00Z",
  lines: [{ id: "line-internal-id", deurId: "deur-internal-id", deurReference: "DEUR-010", rentalEquipmentLineId: "rental-line-internal-id", equipmentId: "equipment-internal-id", operatorId: "operator-internal-id", equipmentSnapshot: { id: "equipment-internal-id", assetNo: "EX-010", name: "Excavator" }, operatorSnapshot: { id: "operator-internal-id", name: "Operator" }, workDate: "2026-10-01", description: "Excavation", costCode: "COST-10", activityCode: "ACT-10", hours: 2, hourlyRate: 100, unitRate: 100, amount: 240, operatingCharge: 200, idleHours: 1, idleCharge: 40, discountAmount, subtotalAfterDiscount: 240-discountAmount, vat: vatApplicable ? (240-discountAmount)*.12 : 0, grandTotal: vatApplicable ? (240-discountAmount)*1.12 : 240-discountAmount }],
});

describe("frozen statement presentation", () => {
  it("shows separate coded Operation and Idle rows without raw UUIDs", () => {
    const document = buildInvoiceDocument(statement());
    expect(document.serviceLines).toEqual(expect.arrayContaining([
      expect.objectContaining({ equipmentCode: "EX-010", activityCode: "ACT-10", costCode: "COST-10", service: "Operation — Excavation", amount: 200 }),
      expect.objectContaining({ equipmentCode: "EX-010", activityCode: "ACT-10", costCode: "COST-10", service: "Idle Hours", amount: 40 }),
    ]));
    const html = renderToStaticMarkup(createElement(InvoiceDocumentView, { document }));
    expect(html).not.toContain("equipment-internal-id");
    expect(html).not.toContain(">VAT<");
  });
  it("omits zero Idle, zero Discount, and disabled VAT in the PDF", () => {
    const source = statement(); source.lines[0].idleCharge = 0; source.lines[0].idleHours = 0;
    const text = billingStatementPdfText(buildInvoiceDocument(source)).join("\n");
    expect(text).not.toContain("Idle Hours"); expect(text).not.toContain("Discount:"); expect(text).not.toContain("VAT:");
  });
  it("shows discount and discounted VAT in both screen and PDF", () => {
    const document = buildInvoiceDocument(statement(40, true));
    const html = renderToStaticMarkup(createElement(InvoiceDocumentView, { document }));
    const pdf = billingStatementPdfText(document).join("\n");
    expect(html).toContain("Net taxable subtotal"); expect(html).toContain("VAT");
    expect(pdf).toContain("Discount: (PHP 40.00)"); expect(pdf).toContain("Net taxable subtotal: PHP 200.00"); expect(pdf).toContain("VAT: PHP 24.00");
  });
  it("uses persisted statement values even when mutable master data changes", () => {
    const source = statement(40, true); const before = buildInvoiceDocument(source);
    const after = buildInvoiceDocument(source, [{ id: "equipment-internal-id", assetNo: "CHANGED", equipmentName: "Changed machine" } as never]);
    expect(after.serviceLines).toEqual(before.serviceLines);
    expect(after.grandTotal).toBe(before.grandTotal);
  });
});
