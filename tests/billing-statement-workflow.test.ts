import { beforeEach, describe, expect, it, vi } from "vitest";

import { storage } from "@/core/storage";
import { buildBillingPreview } from "@/features/rental/workspace/billing/BillingPreviewBuilder";
import type { RentalAggregate } from "@/features/rental/aggregate";

function aggregate(status: RentalAggregate["rental"]["status"] = "Returned"): RentalAggregate {
  return {
    rentalEquipmentLines: [],
    rental: {
      id: "rental-1", rentalNumber: "R-001", equipmentId: "equipment-1", operatorId: "operator-1",
      customerId: "customer-1", projectId: "project-1", customer: "Customer", project: "Project",
      rentedBy: "", dateOut: "2026-07-01", expectedReturn: "2026-07-02", statusId: "", status,
    },
    equipment: {
      id: "equipment-1", prefixId: "", assetNo: "EQP-000001", equipmentName: "Excavator",
      category: "Moving Equipment", maintenanceType: "Engine Hours", currentReading: 0,
      projectId: "project-1", operatorId: "operator-1", status: "Available",
    },
    operator: { id: "operator-1", name: "Operator", email: "", licenseNumber: "", certificationType: "None", status: "Active", joinedDate: "" },
    contract: {
      id: "contract-1", contractNo: "C-001", customerId: "customer-1", equipmentId: "equipment-1", projectId: "project-1",
      rentalType: "Operated Rental", billingMethod: "Per Hour", currency: "PHP", unitRate: 125,
      operatorIncluded: true, startDate: "2026-07-01", expectedEndDate: "2026-07-31", status: "Active",
      createdAt: "2026-07-01", updatedAt: "2026-07-01",
    },
    deurs: [],
    billing: {
      totalOperatingCharge: 0, totalIdleCharge: 0, totalMobilizationCharge: 0, totalDemobilizationCharge: 0,
      totalAdjustment: 0, subtotal: 0, invoiced: 0, collected: 0, outstanding: 0,
    },
  };
}

const calculatedLines = () => buildBillingPreview([{
  id: "deur-1", rentalId: "rental-1", equipmentId: "equipment-1", operatorId: "operator-1", projectId: "project-1",
  workDate: "2026-07-02", logs: [], totalOperatingMinutes: 60, totalIdleMinutes: 0, totalMaintenanceMinutes: 0,
  totalMealBreakMinutes: 0, totalMobilizationMinutes: 0, totalDemobilizationMinutes: 0, status: "Pending Acknowledgement",
  endOfDay: "2026-07-02T17:00:00.000Z",
  createdAt: "2026-07-02", updatedAt: "2026-07-02",
}], aggregate().contract!, "2026-07-01", "2026-07-31");

describe("billing statement workflow", () => {
  beforeEach(() => {
    storage.clear();
    vi.resetModules();
  });

  it("persists a calculated Not Invoiced statement with a scoped refresh", async () => {
    const [{ createBillingStatementForRental }, { billingStatementRepository }, { subscribeRentalWorkspaceChange }] = await Promise.all([
      import("@/features/rental/billingstatement/services/BillingStatementWorkflow"),
      import("@/features/rental/billingstatement/repository"),
      import("@/features/rental/workspace/workspaceRefresh"),
    ]);
    let matching = 0;
    let unrelated = 0;
    const stopMatching = subscribeRentalWorkspaceChange("rental-1", () => { matching += 1; });
    const stopUnrelated = subscribeRentalWorkspaceChange("rental-2", () => { unrelated += 1; });
    const lines = calculatedLines();
    const result = createBillingStatementForRental(aggregate(), "2026-07-01", "2026-07-31", lines);

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.statement).toMatchObject({
      rentalId: "rental-1",
      equipmentId: "equipment-1",
      operatorId: "operator-1",
      invoiceStatus: "Not Invoiced",
    });
    expect(result.statement.subtotal).toBe(lines.reduce((sum, line) => sum + line.amount, 0));
    expect(billingStatementRepository.getById(result.statement.id)).toEqual(result.statement);
    expect(matching).toBe(1);
    expect(unrelated).toBe(0);
    stopMatching();
    stopUnrelated();

    vi.resetModules();
    const { billingStatementRepository: reloadedRepository } = await import("@/features/rental/billingstatement/repository");
    expect(reloadedRepository.getById(result.statement.id)).toMatchObject({ rentalId: "rental-1", subtotal: result.statement.subtotal });
  });

  it("rejects invalid creation and permits only forward invoice status changes", async () => {
    const [{ createBillingStatementForRental, updateBillingInvoiceStatus }, { isInvoicePreparationComplete }, { billingStatementRepository }] = await Promise.all([
      import("@/features/rental/billingstatement/services/BillingStatementWorkflow"),
      import("@/features/rental/billingstatement/services/BillingReadiness"),
      import("@/features/rental/billingstatement/repository"),
    ]);
    const lines = calculatedLines();

    expect(createBillingStatementForRental(aggregate("Cancelled"), "2026-07-01", "2026-07-31", lines).success).toBe(false);
    expect(createBillingStatementForRental(aggregate("Closed"), "2026-07-01", "2026-07-31", lines).success).toBe(false);
    expect(createBillingStatementForRental(aggregate(), "2026-07-01", "2026-07-31", []).success).toBe(false);

    const created = createBillingStatementForRental(aggregate(), "2026-07-01", "2026-07-31", lines);
    expect(created.success).toBe(true);
    if (!created.success) return;
    expect(createBillingStatementForRental(aggregate(), "2026-07-01", "2026-07-31", lines).success).toBe(false);
    expect(updateBillingInvoiceStatus(created.statement.id, "Partially Collected").success).toBe(false);
    expect(updateBillingInvoiceStatus(created.statement.id, "Invoiced")).toMatchObject({ success: true, statement: { invoiceStatus: "Invoiced" } });
    expect(billingStatementRepository.getById(created.statement.id)?.invoiceStatus).toBe("Invoiced");
    expect(updateBillingInvoiceStatus(created.statement.id, "Partially Collected")).toMatchObject({ success: true, statement: { invoiceStatus: "Partially Collected" } });
    const fullyCollected = updateBillingInvoiceStatus(created.statement.id, "Fully Collected");
    expect(fullyCollected).toMatchObject({ success: true, statement: { invoiceStatus: "Fully Collected" } });
    if (fullyCollected.success) {
      expect(fullyCollected.statement).not.toHaveProperty("paidAmount");
      expect(fullyCollected.statement).not.toHaveProperty("outstandingBalance");
    }
    expect(isInvoicePreparationComplete("Invoiced")).toBe(true);
    expect(isInvoicePreparationComplete("Partially Collected")).toBe(true);
    expect(isInvoicePreparationComplete("Fully Collected")).toBe(true);
    expect(isInvoicePreparationComplete("Not Invoiced")).toBe(false);
  });
});
