import { describe, expect, it } from "vitest";
import { getInvoiceCreationEligibility } from "@/features/rental/billingstatement/services/invoiceCreationEligibility";
import type { BillingStatement } from "@/features/rental/billingstatement/types";
import { readFileSync } from "node:fs";

const panel = readFileSync("src/features/rental/workspace/invoice/InvoicePanel.tsx", "utf8");
const summary = readFileSync("src/features/rental/workspace/invoice/useInvoiceSummary.ts", "utf8");
const sql = readFileSync("supabase/migrations/20260729001000_phase_c3b_billing_commands.sql", "utf8");

const statement = (overrides: Partial<BillingStatement> = {}): BillingStatement => ({
  id: "statement-1", statementNo: "BS-1", version: 3, rentalId: "rental-1", equipmentId: "equipment-1", operatorId: "operator-1",
  customer: "Customer", project: "Project", billingFrom: "2026-09-30", billingTo: "2026-09-30", subtotal: 1000, grandTotal: 1000,
  approvalStatus: "Approved", invoiceStatus: "Not Invoiced", createdBy: "actor", createdAt: "2026-09-30T00:00:00Z",
  lines: [{ id: "line-1", deurId: "deur-1", workDate: "2026-09-30", description: "Service", costCode: "C", hours: 1, hourlyRate: 1000, amount: 1000 }],
  ...overrides,
});

describe("production invoice creation eligibility", () => {
  it("allows only approved, not-invoiced statements with permission and valid rows", () => {
    expect(getInvoiceCreationEligibility(statement(), true)).toEqual({ eligible: true });
    expect(getInvoiceCreationEligibility(statement({ approvalStatus: "Draft" }), true).eligible).toBe(false);
    expect(getInvoiceCreationEligibility(statement({ invoiceStatus: "Invoiced" }), true).eligible).toBe(false);
    expect(getInvoiceCreationEligibility(statement(), false).eligible).toBe(false);
    expect(getInvoiceCreationEligibility(statement({ lines: [] }), true).eligible).toBe(false);
  });
});

describe("normal invoice workflow surface", () => {
  it("uses the normal Invoices workflow rather than a fixture or UAT-only control", () => {
    expect(panel).toContain("Ready to Invoice");
    expect(panel).toContain("Create Invoice");
    expect(panel).toContain("window.confirm");
    expect(panel).toContain("billing.update");
    expect(panel).toContain("billingFinancialCommands.createInvoice");
    expect(panel).toContain("notifyRentalWorkspaceChange");
    expect(panel).toContain("inFlight");
    expect(panel).not.toContain("uat.pscequipment.online");
    expect(panel).not.toContain("BS-2026-000002");
  });

  it("reads approved statements from the canonical workspace read model", () => {
    expect(summary).toContain("useRentalWorkspaceBillingStatements");
    expect(summary).toContain('statement.invoiceStatus !== "Not Invoiced"');
    expect(sql).toContain("statement.approval_status<>'Approved'");
    expect(sql).toContain("statement.invoice_status<>required_status");
    expect(sql).toContain("command_create_invoice");
  });
});
