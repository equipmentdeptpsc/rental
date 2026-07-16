import { afterEach, describe, expect, it, vi } from "vitest";
import { buildRentalAggregate } from "@/features/rental/aggregate/builders/buildRentalAggregate";
import { buildCloseReadiness } from "@/features/rental/workspace/closing/CloseReadinessBuilder";
import { notifyRentalWorkspaceChange, subscribeRentalWorkspaceChange } from "@/features/rental/workspace/workspaceRefresh";
import type { RentalRecord } from "@/features/rental/types";

const rental: RentalRecord = {
  id: "rental-1", rentalNumber: "R-1", equipmentId: "equipment-1", customer: "Customer",
  project: "Project", rentedBy: "User", dateOut: "2026-01-01", expectedReturn: "2026-01-02",
  statusId: "status", status: "Returned",
};

function aggregate(billing: Partial<ReturnType<typeof buildRentalAggregate>["billing"]> = {}) {
  return buildRentalAggregate({ rental, billing });
}

describe("billing aggregate and close readiness", () => {
  it("blocks a missing, draft, or not-invoiced statement", () => {
    for (const billing of [
      { hasStatement: false, invoicePreparationComplete: false, subtotal: 0 },
      { hasStatement: true, invoiceStatus: "Draft", invoicePreparationComplete: false, subtotal: 25 },
      { hasStatement: true, invoiceStatus: "Not Invoiced", invoicePreparationComplete: false, subtotal: 25 },
    ]) {
      const readiness = buildCloseReadiness(aggregate(billing));
      expect(readiness.canClose).toBe(false);
      expect(readiness.hasUnbilledOperations).toBe(true);
    }
  });

  it("accepts invoice-prepared statuses without inferring payment", () => {
    for (const status of ["Invoiced", "Partially Collected", "Fully Collected"]) {
      const current = aggregate({ hasStatement: true, invoiceStatus: status, invoicePreparationComplete: true, subtotal: 100 });
      expect(current.billing.subtotal).toBe(100);
      expect(buildCloseReadiness(current).hasUnbilledOperations).toBe(false);
      expect(current.billing.outstanding).toBe(0);
    }
  });
});

describe("rental workspace refresh events", () => {
  afterEach(() => vi.restoreAllMocks());

  it("notifies only matching rental subscribers and cleans up", () => {
    const matching = vi.fn();
    const other = vi.fn();
    const unsubscribe = subscribeRentalWorkspaceChange("rental-1", matching);
    const unsubscribeOther = subscribeRentalWorkspaceChange("rental-2", other);

    notifyRentalWorkspaceChange("rental-1");
    expect(matching).toHaveBeenCalledTimes(1);
    expect(other).not.toHaveBeenCalled();

    unsubscribe();
    notifyRentalWorkspaceChange("rental-1");
    expect(matching).toHaveBeenCalledTimes(1);
    unsubscribeOther();
  });
});
