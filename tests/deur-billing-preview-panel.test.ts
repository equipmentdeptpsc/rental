import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it } from "vitest";

import BillingPreviewPanel from "@/features/rental/workspace/deur/BillingPreviewPanel";
import type { DeurBillingPreview } from "@/features/rental/deur/billing/createDeurBillingPreview";

function preview(overrides: Partial<DeurBillingPreview> = {}): DeurBillingPreview {
  return {
    status: "available", calculatedAt: "2026-07-20T10:00:00.000Z", billingMethod: "Per Hour",
    eligibility: { eligible: true, reasonCodes: ["ELIGIBLE"] },
    evidence: { operatingMinutes: 60, idleMinutes: 0, mobilizationMinutes: 0, demobilizationMinutes: 0, hasRunningActivity: false, completedShift: true },
    rates: { unitRate: 100, operatorIncluded: true }, issues: [],
    charges: { operatingHours: 1, idleHours: 0, mobilizationHours: 0, demobilizationHours: 0, operatingCharge: 100, idleCharge: 0, mobilizationCharge: 0, demobilizationCharge: 0, operatorCharge: 0, fuelCharge: 0, subtotal: 100, vat: 0, withholdingTax: 0, grandTotal: 100 },
    ...overrides,
  };
}

describe("DEUR billing preview panel", () => {
  it("renders a read-only final breakdown and omits zero optional rows", async () => {
    const container = document.createElement("div"); const root = createRoot(container);
    await act(async () => root.render(createElement(BillingPreviewPanel, { preview: preview(), currency: "PHP" })));
    expect(container.textContent).toContain("Billing Preview");
    expect(container.textContent).toContain("Final preview");
    expect(container.textContent).toContain("₱100.00");
    expect(container.textContent).not.toContain("Fuel");
    expect(container.querySelector("button")).toBeNull();
    await act(async () => root.unmount());
  });

  it("shows live estimates and actionable unavailable reasons without posting actions", async () => {
    const container = document.createElement("div"); const root = createRoot(container);
    await act(async () => root.render(createElement(BillingPreviewPanel, { preview: preview({ status: "provisional", disclaimer: "Live estimate only." }), currency: "PHP" })));
    expect(container.textContent).toContain("Live estimate"); expect(container.textContent).toContain("Live estimate only.");
    await act(async () => root.render(createElement(BillingPreviewPanel, { preview: preview({ status: "not-calculable", charges: undefined, issues: [{ code: "UNIT_RATE_REQUIRED", message: "A positive billing unit rate is required.", field: "unitRate" }] }), currency: "PHP" })));
    expect(container.textContent).toContain("Not calculable"); expect(container.textContent).toContain("positive billing unit rate");
    expect(container.querySelector("button")).toBeNull();
    await act(async () => root.unmount());
  });
});
