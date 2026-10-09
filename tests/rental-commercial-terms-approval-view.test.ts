import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it } from "vitest";
import CommercialTermsForApprovalCard from "@/features/rental/workspace/overview/cards/CommercialTermsForApprovalCard";
import FinancialSummaryCard from "@/features/rental/workspace/overview/cards/FinancialSummaryCard";
import type { RentalEquipmentLine } from "@/features/rental/equipment-line";
import type { RentalRecord } from "@/features/rental/types";
import type { RentalContractRecord } from "@/features/rental/types/RentalContract";

const rental = { id: "rental-1", status: "Draft", approvalStatus: "Pending", rentalType: "Operated Rental" } as RentalRecord;
const line = { id: "line-1", rentalId: rental.id, equipmentId: "equipment-1" } as RentalEquipmentLine;
const contract = {
  id: "contract-1", rentalId: rental.id, rentalEquipmentLineId: line.id,
  billingMethod: "Per Hour", currency: "PHP", unitRate: 12500,
  minimumBillableHours: 8, mobilizationFee: 2500, demobilizationFee: 1800,
  idleRate: 300, standbyRate: 500, discountType: "PERCENTAGE", discountValue: 10,
  vatApplicability: "Applicable", taxRate: 12, withholdingTax: 2,
  operatorIncluded: true, transactionRelationship: "Non-Affiliate", remarks: "Net 30",
} as RentalContractRecord;

async function render(contracts: RentalContractRecord[] = [contract], lines: RentalEquipmentLine[] = [line]) {
  const container = document.createElement("div");
  const root = createRoot(container);
  await act(async () => root.render(createElement("div", null,
    createElement(CommercialTermsForApprovalCard, { rental, lines, contracts, equipmentLabels: { "equipment-1": "EQ-101 - Excavator" } }),
    createElement(FinancialSummaryCard, { financial: { operatingCharges: 0, idleCharges: 0, mobilizationCharges: 0, demobilizationCharges: 0, adjustments: 0, subtotal: 0 } }),
  )));
  return { container, root };
}

describe("Rental Workspace commercial terms for approval", () => {
  it("shows the persisted Draft contract alongside a separate zero accrued Financial Summary", async () => {
    const { container, root } = await render();
    const terms = container.querySelector('[aria-label="Commercial Terms for Approval"]');
    expect(terms?.textContent).toContain("Operated Rental");
    expect(terms?.textContent).toContain("Per Hour");
    expect(terms?.textContent).toContain("Base Rental Rate");
    expect(terms?.textContent).toContain("12,500.00 / hour");
    expect(terms?.textContent).toContain("8 hours");
    expect(terms?.textContent).toContain("Mobilization Fee");
    expect(terms?.textContent).toContain("Demobilization Fee");
    expect(terms?.textContent).toContain("Idle Rate");
    expect(terms?.textContent).toContain("Standby Rate");
    expect(terms?.textContent).toContain("Percentage");
    expect(terms?.textContent).toContain("10%");
    expect(terms?.textContent).toContain("VAT Rate12%");
    expect(terms?.textContent).toContain("Withholding Tax2%");
    expect(terms?.textContent).toContain("Net 30");
    expect(terms?.querySelectorAll("input, select, textarea, button, a")).toHaveLength(0);
    expect(container.textContent).toContain("Financial Summary");
    expect(container.textContent).toContain("₱ 0");
    await act(async () => root.unmount());
  });

  it("never borrows commercial terms from another rental line", async () => {
    const otherLine = { id: "line-2", rentalId: rental.id, equipmentId: "equipment-2" } as RentalEquipmentLine;
    const { container, root } = await render([contract], [line, otherLine]);
    expect(container.textContent).toContain("Commercial terms are not configured for this equipment line.");
    expect(container.querySelectorAll('[aria-label="Commercial Terms for Approval"] article')).toHaveLength(2);
    await act(async () => root.unmount());
  });
});
