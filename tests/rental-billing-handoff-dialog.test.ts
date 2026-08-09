import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";

import BillingHandoffReviewDialog from "@/features/rental/workspace/closing/BillingHandoffReviewDialog";
import type { BillingHandoffReview } from "@/features/rental/billingstatement/services/executeRentalBillingHandoff";

const review: BillingHandoffReview = {
  rentalId: "rental-1", rentalReference: "R-001", deurId: "deur-1", deurReference: "DEUR-001",
  billingMethod: "Per Hour", calculatedAt: "2026-07-20T11:00:00.000Z", previewStatus: "available",
  charges: { operatingHours: 1, idleHours: 0, mobilizationHours: 0, demobilizationHours: 0, operatingCharge: 100, idleCharge: 0, mobilizationCharge: 0, demobilizationCharge: 0, operatorCharge: 0, fuelCharge: 0, subtotal: 100, vat: 12, withholdingTax: 2, grandTotal: 110 },
  eligibilityReasonCodes: ["ELIGIBLE"], sourceUpdatedAt: "2026-07-20T11:00:00.000Z", contractUpdatedAt: "2026-07-20T00:00:00.000Z",
};

describe("billing handoff review dialog", () => {
  it("renders consequences and exact non-zero totals without mutating on open or cancel", async () => {
    const confirm = vi.fn(); const cancel = vi.fn(); const container = document.createElement("div"); const root = createRoot(container);
    await act(async () => root.render(createElement(BillingHandoffReviewDialog, { open: true, review, currency: "PHP", loading: false, onConfirm: confirm, onCancel: cancel })));
    expect(container.textContent).toContain("R-001"); expect(container.textContent).toContain("DEUR-001");
    expect(container.textContent).toContain("Create Billing Statement");
    expect(container.textContent).toContain("rental remains Returned");
    expect(container.textContent).toContain("₱110.00"); expect(container.textContent).not.toContain("Fuel");
    expect(confirm).not.toHaveBeenCalled();
    await act(async () => [...container.querySelectorAll("button")].find((button) => button.textContent === "Cancel")?.click());
    expect(cancel).toHaveBeenCalledOnce(); expect(confirm).not.toHaveBeenCalled();
    await act(async () => root.unmount());
  });

  it("disables confirmation while execution is running", async () => {
    const container = document.createElement("div"); const root = createRoot(container);
    await act(async () => root.render(createElement(BillingHandoffReviewDialog, { open: true, review, currency: "PHP", loading: true, onConfirm: vi.fn(), onCancel: vi.fn() })));
    expect([...container.querySelectorAll("button")].every((button) => button.disabled)).toBe(true);
    await act(async () => root.unmount());
  });
});
