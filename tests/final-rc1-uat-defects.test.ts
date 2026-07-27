import { describe, expect, it } from "vitest";
import { formatOperationalHours, formatPhpCurrency } from "@/features/rental/presentation/formatBusinessValues";
import { formatCustomerReviewActivityRange, formatCustomerReviewDateTime } from "@/features/rental/customer-review/customerReviewDateTime";
import { renderCustomerReviewEmailHtml } from "@/features/rental/customer-review/developmentCustomerReviewOutbox";
import { resolveBillingConsumedPresentation } from "@/features/rental/workspace/billing/resolveBillingConsumedPresentation";
import { buildInvoiceSummary } from "@/features/rental/workspace/invoice/InvoiceBuilder";
import { buildTimeline } from "@/features/rental/workspace/timeline/TimelineBuilder";
import { visibleRentalQuickActions } from "@/features/rental/quick-actions/rentalQuickActions";
import { operatorActionSuccessMessage } from "@/pages/OperatorDeur";

const aggregate = {
  rental: {
    id: "11111111-1111-4111-8111-111111111111", customer: "UAT Customer", project: "UAT Project",
    status: "Closed", createdAt: "2026-07-27T08:00:00.000Z", reservedAt: "2026-07-27T08:10:00.000Z",
    releasedAt: "2026-07-27T08:30:00.000Z", activatedAt: "2026-07-27T08:40:00.000Z",
    returnedAt: "2026-07-27T10:00:00.000Z", closedAt: "2026-07-27T10:10:00.000Z",
  },
  rentalEquipmentLines: [{ id: "22222222-2222-4222-8222-222222222222", rentalId: "11111111-1111-4111-8111-111111111111", equipmentId: "33333333-3333-4333-8333-333333333333" }],
  deurs: [{
    id: "44444444-4444-4444-8444-444444444444", deurNumber: "DEUR-000001", rentalId: "11111111-1111-4111-8111-111111111111",
    rentalEquipmentLineId: "22222222-2222-4222-8222-222222222222", equipmentId: "33333333-3333-4333-8333-333333333333",
    operatorId: "operator", createdAt: "2026-07-27T08:45:00.000Z", updatedAt: "2026-07-27T09:20:00.000Z", workDate: "2026-07-27",
    status: "Billed", logs: [], totalOperatingMinutes: 1, totalIdleMinutes: 0, totalMaintenanceMinutes: 0, totalMealBreakMinutes: 0,
    totalMobilizationMinutes: 0, totalDemobilizationMinutes: 0, submittedAt: "2026-07-27T09:10:00.000Z",
    billingLocked: true, billingStatementId: "55555555-5555-4555-8555-555555555555",
    revision: { chainId: "chain", revisionNumber: 1, originalDeurId: "44444444-4444-4444-8444-444444444444" },
    reviewHistory: [
      { action: "submitted", actorName: "UAT Operator", timestamp: "2026-07-27T09:10:00.000Z" },
      { action: "acknowledged", actorName: "UAT Customer", timestamp: "2026-07-27T09:20:00.000Z" },
    ],
  }],
  billing: { subtotal: 1.667, invoiced: 1.867, collected: 1.867, outstanding: 0 },
} as any;

const statement = {
  id: "55555555-5555-4555-8555-555555555555", statementNo: "BS-12345", version: 1,
  rentalId: aggregate.rental.id, equipmentId: aggregate.deurs[0].equipmentId, operatorId: "operator",
  customer: "UAT Customer", project: "UAT Project", billingFrom: "2026-07-27", billingTo: "2026-07-27",
  subtotal: 1.667, grandTotal: 1.867, approvalStatus: "Draft", invoiceStatus: "Fully Collected",
  invoiceStatusUpdatedAt: "2026-07-27T09:40:00.000Z", createdBy: "Admin", createdAt: "2026-07-27T09:30:00.000Z",
  lines: [{ deurId: aggregate.deurs[0].id, workDate: "2026-07-27", description: "Operation", costCode: "", hours: 1 / 60, hourlyRate: 100, amount: 1.667 }],
} as any;

describe("FINAL RC1 verified UAT defects", () => {
  it("renders consumed billing evidence with business references and no UUIDs", () => {
    const notice = resolveBillingConsumedPresentation({
      aggregate, deur: aggregate.deurs[0],
      equipment: [{ id: aggregate.deurs[0].equipmentId, equipmentName: "UAT 1", assetNo: "NME-000001" } as any],
      statements: [statement],
    });
    const output = `${notice.label} ${notice.message}`;
    expect(output).toContain("Rental Line 1 — UAT 1 (NME-000001)");
    expect(output).toContain("DEUR-000001 R1 was included in Billing Statement BS-12345");
    expect(output).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i);
  });

  it("uses accurate Operator activity success wording", () => {
    expect(operatorActionSuccessMessage("START_OPERATION")).toBe("Start Operation saved locally.");
    expect(operatorActionSuccessMessage("END_ACTIVITY")).toBe("End Activity saved locally.");
    expect(operatorActionSuccessMessage("END_ACTIVITY")).not.toContain("No activity in progress");
  });

  it("aggregates the durable downstream lifecycle chronologically without user-facing UUIDs", () => {
    const events = buildTimeline(aggregate, {
      customerReviews: [{
        id: "review-id", deurId: aggregate.deurs[0].id, deurNumber: "DEUR-000001", revisionNumber: 1,
        rentalNumber: "RENT-00001", customerName: "UAT Customer", representativeName: "UAT Representative",
        representativeEmail: "uat@example.test", generatedAt: "2026-07-27T09:11:00.000Z", expiresAt: "2026-08-03T09:11:00.000Z",
        token: "token", status: "Acknowledged", subject: "Review", snapshot: {} as any, html: "",
      }],
      billingStatements: [statement],
      collections: [
        { id: "collection-1", statementId: statement.id, rentalId: aggregate.rental.id, amount: 1, paymentDate: "2026-07-27", referenceNumber: "PAY-1", recordedBy: "Admin", recordedAt: "2026-07-27T09:50:00.000Z" },
        { id: "collection-2", statementId: statement.id, rentalId: aggregate.rental.id, amount: .867, paymentDate: "2026-07-27", referenceNumber: "PAY-2", recordedBy: "Admin", recordedAt: "2026-07-27T09:55:00.000Z" },
      ],
    });
    expect(events.map((event) => event.title)).toEqual(expect.arrayContaining([
      "DEUR Created", "DEUR Submitted", "Customer Review Request Generated", "Customer Acknowledged",
      "Billing Statement Created", "Marked Invoiced", "Partial Collection Recorded", "Final Collection Recorded",
      "Invoice Fully Collected", "Returned", "Closed",
    ]));
    expect(events.map((event) => Date.parse(event.date))).toEqual([...events].map((event) => Date.parse(event.date)).sort((a, b) => a - b));
    expect(events.map((event) => `${event.title} ${event.description}`).join(" ")).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i);
  });

  it("formats Customer Review timestamps and rendered email without raw ISO values", () => {
    expect(formatCustomerReviewDateTime("2026-07-27T09:33:21.355Z")).not.toContain("T09:33");
    expect(formatCustomerReviewActivityRange("2026-07-27T09:33:21.355Z", "2026-07-27T09:48:21.355Z")).not.toContain("2026-07-27T");
    const html = renderCustomerReviewEmailHtml({
      deurId: "deur", deurNumber: "DEUR-000001", revisionNumber: 1, rentalNumber: "RENT-00001",
      customerName: "Customer", representativeName: "Representative", representativeEmail: "customer@example.test",
      snapshot: { project: "Project", equipment: "Equipment", operator: "Operator", workDate: "2026-07-27", submittedAt: "2026-07-27T09:33:21.355Z", operationMinutes: 15, idleMinutes: 0, breakdownMinutes: 0, origin: "OPERATOR_DIGITAL", timeline: [{ activityType: "Operation", start: "2026-07-27T09:33:21.355Z", end: "2026-07-27T09:48:21.355Z", durationMinutes: 15 }] },
    }, "token");
    expect(html).not.toMatch(/2026-07-27T\d{2}:\d{2}/);
  });

  it("formats operational quantities and PHP currency only at presentation boundaries", () => {
    expect(formatOperationalHours(1 / 60)).toBe("0.02 h");
    expect(formatOperationalHours(1.5)).toBe("1.50 h");
    expect(formatOperationalHours(8)).toBe("8.00 h");
    expect(formatPhpCurrency(0)).toMatch(/0\.00$/);
    expect(formatPhpCurrency(1.667)).toMatch(/1\.67$/);
  });

  it("selects the newest eligible invoice deterministically", () => {
    const older = { ...statement, id: "older", statementNo: "BS-100", invoiceStatusUpdatedAt: "2026-07-26T09:40:00.000Z" };
    const cancelled = { ...statement, id: "cancelled", statementNo: "BS-999", invoiceStatus: "Cancelled", invoiceStatusUpdatedAt: "2026-07-28T09:40:00.000Z" };
    expect(buildInvoiceSummary(aggregate, [older, statement, cancelled] as any).latestInvoiceNo).toBe("BS-12345");
    expect(buildInvoiceSummary(aggregate, [] as any).latestInvoiceNo).toBeUndefined();
  });

  it("keeps the close quick action on other tabs and suppresses it on the guided closing tab", () => {
    const model = { actions: [{ id: "close" as const, label: "Close Rental" }] };
    expect(visibleRentalQuickActions(model, false)).toHaveLength(1);
    expect(visibleRentalQuickActions(model, true)).toHaveLength(0);
  });
});
