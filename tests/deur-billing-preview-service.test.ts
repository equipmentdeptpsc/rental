import { describe, expect, it } from "vitest";

import { BillingRateEngine, type BillingCalculationTerms } from "@/features/rental/billing/engine";
import { createDeurBillingPreview } from "@/features/rental/deur/billing/createDeurBillingPreview";
import { mapDeurBillingPreviewCharges } from "@/features/rental/deur/billing/mapDeurBillingPreviewCharges";
import type { DeurRecord } from "@/features/rental/deur/types";

function terms(overrides: Partial<BillingCalculationTerms> = {}): BillingCalculationTerms {
  return { billingMethod: "Per Hour", unitRate: 100, operatorIncluded: true, ...overrides };
}

function completed(overrides: Partial<DeurRecord> = {}): DeurRecord {
  return {
    id: "deur-1", rentalId: "rental-1", equipmentId: "equipment-1", operatorId: "operator-1",
    workDate: "2026-07-20", logs: [], status: "Acknowledged", legacy: false,
    totalOperatingMinutes: 60, totalIdleMinutes: 30, totalMaintenanceMinutes: 0, totalMealBreakMinutes: 0,
    totalMobilizationMinutes: 15, totalDemobilizationMinutes: 10,
    events: [
      { id: "shift-start", activityType: "shift", action: "start", timestamp: "2026-07-20T08:00:00.000Z", sequence: 1, source: "user" },
      { id: "operation-start", activityType: "operation", action: "start", timestamp: "2026-07-20T08:30:00.000Z", sequence: 2, source: "user" },
      { id: "operation-end", activityType: "operation", action: "end", timestamp: "2026-07-20T09:30:00.000Z", sequence: 3, source: "user" },
      { id: "idle-start", activityType: "idle", action: "start", timestamp: "2026-07-20T09:30:00.000Z", sequence: 4, source: "user" },
      { id: "idle-end", activityType: "idle", action: "end", timestamp: "2026-07-20T10:00:00.000Z", sequence: 5, source: "user" },
      { id: "shift-end", activityType: "shift", action: "end", timestamp: "2026-07-20T10:00:00.000Z", sequence: 6, source: "user" },
    ],
    createdAt: "2026-07-20T08:00:00.000Z", updatedAt: "2026-07-20T10:00:00.000Z",
    ...overrides,
  };
}

function running(overrides: Partial<DeurRecord> = {}): DeurRecord {
  return completed({
    status: "In Progress", totalOperatingMinutes: 0, totalIdleMinutes: 0,
    events: [
      { id: "shift-start", activityType: "shift", action: "start", timestamp: "2026-07-20T08:00:00.000Z", sequence: 1, source: "user" },
      { id: "operation-start", activityType: "operation", action: "start", timestamp: "2026-07-20T08:30:00.000Z", sequence: 2, source: "user" },
    ],
    ...overrides,
  });
}

describe("DEUR billing preview domain service", () => {
  it("uses canonical hourly evidence, minimum hours, and the unchanged billing engine", () => {
    const deur = completed();
    const configured = terms({ minimumBillableHours: 3, standbyRate: 20, mobilizationFee: 30, demobilizationFee: 40, fuelCharge: 50, operatorIncluded: false, operatorRate: 60, taxRate: 12, withholdingTax: 2 });
    const preview = createDeurBillingPreview({ deur, terms: configured, evaluatedAt: "2026-07-20T10:00:00.000Z" });
    expect(preview).toMatchObject({ status: "available", evidence: { operatingMinutes: 60, idleMinutes: 30, completedShift: true, hasRunningActivity: false }, charges: { operatingHours: 3, operatingCharge: 300 } });
    expect(preview.charges).toEqual(BillingRateEngine.calculate(deur, configured));
  });

  it("produces deterministic provisional live estimates that advance with evaluation time", () => {
    const deur = running(); const original = structuredClone(deur); const configured = terms();
    const first = createDeurBillingPreview({ deur, terms: configured, evaluatedAt: "2026-07-20T09:00:00.000Z" });
    const repeated = createDeurBillingPreview({ deur, terms: configured, evaluatedAt: "2026-07-20T09:00:00.000Z" });
    const later = createDeurBillingPreview({ deur, terms: configured, evaluatedAt: "2026-07-20T09:30:00.000Z" });
    expect(first).toEqual(repeated);
    expect(first).toMatchObject({ status: "provisional", evidence: { operatingMinutes: 30, hasRunningActivity: true, completedShift: false }, eligibility: { eligible: false, reasonCodes: ["NOT_ACKNOWLEDGED"] } });
    expect(later.evidence.operatingMinutes).toBe(60);
    expect(later.charges!.grandTotal).toBeGreaterThan(first.charges!.grandTotal);
    expect(deur).toEqual(original);
  });

  it("does not create negative duration or charges from a future activity timestamp", () => {
    const preview = createDeurBillingPreview({ deur: running(), terms: terms(), evaluatedAt: "2026-07-20T08:15:00.000Z" });
    expect(preview.evidence.operatingMinutes).toBe(0);
    expect(preview.charges?.operatingCharge).toBe(0);
  });

  it.each(["Per Day", "Per Week", "Per Month"] as const)("delegates %s fixed-rate behavior", (billingMethod) => {
    const preview = createDeurBillingPreview({ deur: completed(), terms: terms({ billingMethod, unitRate: 450 }), evaluatedAt: "2026-07-20T10:00:00.000Z" });
    expect(preview).toMatchObject({ status: "available", charges: { operatingCharge: 450 } });
  });

  it("uses contract amount for One Lot without changing engine fallback behavior", () => {
    expect(createDeurBillingPreview({ deur: completed(), terms: terms({ billingMethod: "One Lot", unitRate: 100, contractAmount: 900 }), evaluatedAt: "2026-07-20T10:00:00.000Z" }).charges?.operatingCharge).toBe(900);
  });

  it("returns not-calculable for cubic-meter quantity and missing required rates", () => {
    const quantity = createDeurBillingPreview({ deur: completed(), terms: terms({ billingMethod: "Per Cubic Meter" }), evaluatedAt: "2026-07-20T10:00:00.000Z" });
    const rate = createDeurBillingPreview({ deur: completed(), terms: terms({ unitRate: 0 }), evaluatedAt: "2026-07-20T10:00:00.000Z" });
    expect(quantity).toMatchObject({ status: "not-calculable", eligibility: { reasonCodes: ["UNSUPPORTED_BILLING_EVIDENCE"] } });
    expect(rate).toMatchObject({ status: "not-calculable", issues: [{ code: "UNIT_RATE_REQUIRED", field: "unitRate" }] });
    expect(quantity.charges).toBeUndefined(); expect(rate.charges).toBeUndefined();
  });

  it.each([
    [{ billingLocked: true }, "BILLING_LOCKED"], [{ status: "Rejected" }, "REJECTED"],
    [{ billingStatementId: "statement-1" }, "ALREADY_BILLED"], [{ legacy: true }, "LEGACY_RECORD"],
    [{ events: undefined }, "RECORD_NOT_CANONICAL"],
  ] as const)("returns ineligible without charges for protected evidence", (overrides, reasonCode) => {
    const preview = createDeurBillingPreview({ deur: completed(overrides as Partial<DeurRecord>), terms: terms(), evaluatedAt: "2026-07-20T10:00:00.000Z" });
    expect(preview).toMatchObject({ status: "ineligible", eligibility: { eligible: false, reasonCodes: [reasonCode] } });
    expect(preview.charges).toBeUndefined();
  });

  it("returns detached serializable structures without mutating either input", () => {
    const deur = completed(); const configured = terms({ standbyRate: 10 });
    const originalDeur = structuredClone(deur); const originalTerms = structuredClone(configured);
    const preview = createDeurBillingPreview({ deur, terms: configured, evaluatedAt: "2026-07-20T10:00:00.000Z" });
    expect(() => JSON.stringify(preview)).not.toThrow();
    (preview.rates as { standbyRate?: number }).standbyRate = 999; preview.charges!.idleCharge = 999;
    expect(deur).toEqual(originalDeur); expect(configured).toEqual(originalTerms);
  });
});

describe("DEUR billing preview charge display mapping", () => {
  it("omits zero optional charges, includes non-zero charges, and always retains core totals", () => {
    const preview = createDeurBillingPreview({ deur: completed(), terms: terms({ standbyRate: 0, mobilizationFee: 0, demobilizationFee: 0, fuelCharge: 0, operatorRate: 0, taxRate: 0, withholdingTax: 0 }), evaluatedAt: "2026-07-20T10:00:00.000Z" });
    const rows = mapDeurBillingPreviewCharges(preview.charges!);
    expect(rows.map((row) => row.key)).toEqual(["operatingCharge", "subtotal", "grandTotal"]);
    expect(rows.find((row) => row.key === "subtotal")).toBeDefined();
    expect(rows.find((row) => row.key === "grandTotal")).toBeDefined();
  });
});
