import { describe, expect, it } from "vitest";
import { calculateDeurBillingStatementLine } from "@/features/rental/billingstatement/services/calculateDeurBillingStatementLine";
import type { DeurRecord } from "@/features/rental/deur/types";
import type { BillingMethod, RentalContractRecord } from "@/features/rental/types/RentalContract";

function deur(overrides: Partial<DeurRecord> = {}): DeurRecord {
  return {
    id: "deur-1", rentalId: "rental-1", equipmentId: "equipment-1", operatorId: "operator-1", workDate: "2026-01-02", logs: [],
    totalOperatingMinutes: 999, totalIdleMinutes: 999, totalMaintenanceMinutes: 0, totalMealBreakMinutes: 0, totalMobilizationMinutes: 0, totalDemobilizationMinutes: 0,
    status: "Acknowledged", legacy: false, createdAt: "2026-01-02T00:00:00.000Z", updatedAt: "2026-01-02T03:00:00.000Z",
    events: [
      { id: "s", activityType: "shift", action: "start", timestamp: "2026-01-02T00:00:00.000Z", sequence: 1, source: "user" },
      { id: "o1", activityType: "operation", action: "start", timestamp: "2026-01-02T01:00:00.000Z", sequence: 2, source: "user" },
      { id: "o2", activityType: "operation", action: "end", timestamp: "2026-01-02T03:00:00.000Z", sequence: 3, source: "user" },
      { id: "e", activityType: "shift", action: "end", timestamp: "2026-01-02T04:00:00.000Z", sequence: 4, source: "user" },
    ],
    ...overrides,
  };
}

function contract(billingMethod: BillingMethod = "Per Hour", overrides: Partial<RentalContractRecord> = {}): RentalContractRecord {
  return {
    id: "contract-1", contractNo: "C-001", customerId: "customer-1", equipmentId: "equipment-1", projectId: "project-1",
    rentalType: "Operated Rental", billingMethod, currency: "PHP", unitRate: 100, operatorIncluded: true,
    startDate: "2026-01-01", expectedEndDate: "2026-01-31", status: "Active", createdAt: "2026-01-01", updatedAt: "2026-01-01",
    ...overrides,
  };
}

describe("billing statement calculation contract", () => {
  it("maps canonical hourly event totals through BillingRateEngine into one stable statement line", () => {
    const source = deur();
    const original = structuredClone(source);
    const result = calculateDeurBillingStatementLine(source, contract());

    expect(result).toMatchObject({ success: true, line: { id: "deur-1", deurId: "deur-1", operatingHours: 2, actualHours: 2, hourlyRate: 100, amount: 200 } });
    expect(source).toEqual(original);
  });

  it.each([
    ["Per Day", 100],
    ["Per Week", 100],
    ["Per Month", 100],
    ["One Lot", 450],
    ["Per Cubic Meter", 0],
  ] as const)("maps %s using the existing engine contract", (billingMethod, expectedAmount) => {
    const result = calculateDeurBillingStatementLine(
      deur(),
      contract(billingMethod, billingMethod === "One Lot" ? { contractAmount: 450 } : {}),
    );

    expect(result).toMatchObject({ success: true, line: { billingMethod, amount: expectedAmount } });
  });

  it("rejects unsupported methods and unsafe runtime numeric inputs", () => {
    expect(calculateDeurBillingStatementLine(deur(), contract("Unknown" as BillingMethod))).toMatchObject({ success: false, code: "INVALID_BILLING_METHOD" });
    expect(calculateDeurBillingStatementLine(deur(), contract("Per Hour", { unitRate: Number.NaN }))).toMatchObject({ success: false, code: "INVALID_NUMERIC_INPUT" });
    expect(calculateDeurBillingStatementLine(deur(), contract("Per Hour", { standbyRate: Number.POSITIVE_INFINITY }))).toMatchObject({ success: false, code: "INVALID_NUMERIC_INPUT" });
    expect(calculateDeurBillingStatementLine(deur({ totalMobilizationMinutes: -1 }), contract())).toMatchObject({ success: false, code: "INVALID_NUMERIC_INPUT" });
    expect(calculateDeurBillingStatementLine(deur({ id: "   " }), contract())).toMatchObject({ success: false, code: "INVALID_DEUR_TOTALS" });
  });

  it("handles zero canonical duration deterministically without synthetic amounts", () => {
    const zero = deur({ events: [
      { id: "s", activityType: "shift", action: "start", timestamp: "2026-01-02T00:00:00.000Z", sequence: 1, source: "user" },
      { id: "e", activityType: "shift", action: "end", timestamp: "2026-01-02T00:00:00.000Z", sequence: 2, source: "user" },
    ] });
    const result = calculateDeurBillingStatementLine(zero, contract());
    expect(result).toMatchObject({ success: true, line: { operatingHours: 0, amount: 0 } });
  });

  it("returns deterministic serializable calculated evidence without mutating inputs", () => {
    const source = deur();
    const terms = contract("Per Hour", { standbyRate: 10, taxRate: 12 });
    const first = calculateDeurBillingStatementLine(source, terms);
    const second = calculateDeurBillingStatementLine(source, terms);

    expect(first).toEqual(second);
    expect(() => JSON.stringify(first)).not.toThrow();
    if (first.success) {
      expect(Object.values(first.charges).every(Number.isFinite)).toBe(true);
      first.line.amount = 999;
    }
    expect(source.events?.[1].timestamp).toBe("2026-01-02T01:00:00.000Z");
  });
});
