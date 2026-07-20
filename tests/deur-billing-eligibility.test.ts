import { describe, expect, it } from "vitest";
import { evaluateDeurBillingEligibility } from "@/features/rental/deur/billing/evaluateDeurBillingEligibility";
import type { DeurRecord } from "@/features/rental/deur/types";

function buildDeur(overrides: Partial<DeurRecord> = {}): DeurRecord {
  return {
    id: "deur-1", rentalId: "rental-1", equipmentId: "equipment-1", operatorId: "operator-1",
    workDate: "2026-01-01", reportDate: "2026-01-01", logs: [], status: "Acknowledged",
    createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T03:00:00.000Z", legacy: false,
    totalOperatingMinutes: 0, totalIdleMinutes: 0, totalMaintenanceMinutes: 0, totalMealBreakMinutes: 0,
    totalMobilizationMinutes: 0, totalDemobilizationMinutes: 0,
    events: [
      { id: "shift-start", activityType: "shift", action: "start", timestamp: "2026-01-01T00:00:00.000Z", sequence: 1, source: "user" },
      { id: "operation-start", activityType: "operation", action: "start", timestamp: "2026-01-01T01:00:00.000Z", sequence: 2, source: "user" },
      { id: "operation-end", activityType: "operation", action: "end", timestamp: "2026-01-01T02:00:00.000Z", sequence: 3, source: "user" },
      { id: "shift-end", activityType: "shift", action: "end", timestamp: "2026-01-01T03:00:00.000Z", sequence: 4, source: "user" },
    ],
    ...overrides,
  };
}

describe("DEUR billing eligibility", () => {
  it("accepts acknowledged canonical hourly evidence without mutating its record", () => {
    const deur = buildDeur();
    const original = structuredClone(deur);
    const result = evaluateDeurBillingEligibility({ deur, billingMethod: "Per Hour" });

    expect(result).toMatchObject({ eligible: true, reasonCode: "ELIGIBLE", deurId: "deur-1", rentalId: "rental-1" });
    expect(result.evidence).toMatchObject({ billableMinutes: 60, totals: { shiftMinutes: 180, operationMinutes: 60 } });
    expect(result.validationIssues).toEqual([]);
    expect(deur).toEqual(original);
  });

  it.each(["Draft", "In Progress", "Submitted"] as const)("does not accept %s before acknowledgement", (status) => {
    expect(evaluateDeurBillingEligibility({ deur: buildDeur({ status }), billingMethod: "Per Hour" }).reasonCode).toBe("NOT_ACKNOWLEDGED");
  });

  it("rejects rejected and reopened records until they are acknowledged again", () => {
    expect(evaluateDeurBillingEligibility({ deur: buildDeur({ status: "Rejected" }), billingMethod: "Per Hour" }).reasonCode).toBe("REJECTED");
    expect(evaluateDeurBillingEligibility({ deur: buildDeur({ status: "In Progress" }), billingMethod: "Per Hour" }).eligible).toBe(false);
  });

  it("rejects missing, incomplete, open, malformed, and reversed event histories", () => {
    const base = buildDeur();
    expect(evaluateDeurBillingEligibility({ deur: buildDeur({ events: base.events?.slice(1) }), billingMethod: "Per Hour" }).reasonCode).toBe("INVALID_EVENT_HISTORY");
    expect(evaluateDeurBillingEligibility({ deur: buildDeur({ events: base.events?.slice(0, -1) }), billingMethod: "Per Hour" }).reasonCode).toBe("SHIFT_NOT_COMPLETED");
    expect(evaluateDeurBillingEligibility({ deur: buildDeur({ events: base.events?.slice(0, 2) }), billingMethod: "Per Hour" }).reasonCode).toBe("SHIFT_NOT_COMPLETED");
    expect(evaluateDeurBillingEligibility({ deur: buildDeur({ events: [...(base.events ?? []), { id: "duplicate-end", activityType: "operation", action: "end", timestamp: "2026-01-01T02:30:00.000Z", sequence: 5, source: "user" }] }), billingMethod: "Per Hour" }).reasonCode).toBe("INVALID_EVENT_HISTORY");
    const reversed = buildDeur({ events: [
      { id: "s", activityType: "shift", action: "start", timestamp: "2026-01-01T03:00:00.000Z", sequence: 1, source: "user" },
      { id: "o1", activityType: "operation", action: "start", timestamp: "2026-01-01T02:00:00.000Z", sequence: 2, source: "user" },
      { id: "o2", activityType: "operation", action: "end", timestamp: "2026-01-01T01:00:00.000Z", sequence: 3, source: "user" },
      { id: "e", activityType: "shift", action: "end", timestamp: "2026-01-01T04:00:00.000Z", sequence: 4, source: "user" },
    ] });
    expect(evaluateDeurBillingEligibility({ deur: reversed, billingMethod: "Per Hour" }).reasonCode).toBe("TOTALS_INVALID");
  });

  it("evaluates valid overnight shifts with existing totals logic", () => {
    const deur = buildDeur({ events: [
      { id: "s", activityType: "shift", action: "start", timestamp: "2026-01-01T22:00:00.000Z", sequence: 1, source: "user" },
      { id: "o1", activityType: "operation", action: "start", timestamp: "2026-01-01T23:00:00.000Z", sequence: 2, source: "user" },
      { id: "o2", activityType: "operation", action: "end", timestamp: "2026-01-02T01:00:00.000Z", sequence: 3, source: "user" },
      { id: "e", activityType: "shift", action: "end", timestamp: "2026-01-02T02:00:00.000Z", sequence: 4, source: "user" },
    ] });
    expect(evaluateDeurBillingEligibility({ deur, billingMethod: "Per Hour" }).evidence?.totals).toMatchObject({ shiftMinutes: 240, operationMinutes: 120 });
  });

  it("rejects non-canonical, protected legacy, and unlinked records without exposing identifiers as reasons", () => {
    expect(evaluateDeurBillingEligibility({ deur: buildDeur({ events: undefined }), billingMethod: "Per Hour" }).reasonCode).toBe("RECORD_NOT_CANONICAL");
    expect(evaluateDeurBillingEligibility({ deur: buildDeur({ legacy: true }), billingMethod: "Per Hour" }).reasonCode).toBe("LEGACY_RECORD");
    expect(evaluateDeurBillingEligibility({ deur: buildDeur({ rentalId: "" }), billingMethod: "Per Hour" }).reasonCode).toBe("RENTAL_LINK_MISSING");
  });

  it("requires supported billable evidence without creating a synthetic amount or duration", () => {
    const noActivity = buildDeur({ events: [
      { id: "s", activityType: "shift", action: "start", timestamp: "2026-01-01T00:00:00.000Z", sequence: 1, source: "user" },
      { id: "e", activityType: "shift", action: "end", timestamp: "2026-01-01T03:00:00.000Z", sequence: 2, source: "user" },
    ] });
    expect(evaluateDeurBillingEligibility({ deur: noActivity, billingMethod: "Per Hour" }).reasonCode).toBe("NO_BILLABLE_ACTIVITY");
    expect(evaluateDeurBillingEligibility({ deur: buildDeur(), billingMethod: "Per Cubic Meter" }).reasonCode).toBe("EVIDENCE_MODE_MISMATCH");
    expect(evaluateDeurBillingEligibility({ deur: noActivity, billingMethod: "Per Day" }).eligible).toBe(true);
  });

  it("rejects locked and already consumed DEURs with serializable typed results", () => {
    expect(evaluateDeurBillingEligibility({ deur: buildDeur({ billingLocked: true }), billingMethod: "Per Hour" }).reasonCode).toBe("BILLING_LOCKED");
    const result = evaluateDeurBillingEligibility({ deur: buildDeur({ billingStatementId: "statement-1" }), billingMethod: "Per Hour" });
    expect(result.reasonCode).toBe("ALREADY_BILLED");
    expect(result.eligible).toBe(false);
    expect(() => JSON.stringify(result.validationIssues)).not.toThrow();
  });

  it("uses deterministic reason precedence for canonical, linkage, lifecycle, and consumption failures", () => {
    expect(evaluateDeurBillingEligibility({ deur: buildDeur({ events: undefined, status: "Draft" }), billingMethod: "Per Hour" }).reasonCode).toBe("RECORD_NOT_CANONICAL");
    expect(evaluateDeurBillingEligibility({ deur: buildDeur({ legacy: true, status: "Draft" }), billingMethod: "Per Hour" }).reasonCode).toBe("LEGACY_RECORD");
    expect(evaluateDeurBillingEligibility({ deur: buildDeur({ rentalId: "", status: "Draft" }), billingMethod: "Per Hour" }).reasonCode).toBe("RENTAL_LINK_MISSING");
    expect(evaluateDeurBillingEligibility({ deur: buildDeur({ status: "Rejected", events: [
      { id: "s", activityType: "shift", action: "start", timestamp: "2026-01-01T00:00:00.000Z", sequence: 1, source: "user" },
      { id: "e", activityType: "shift", action: "end", timestamp: "2026-01-01T01:00:00.000Z", sequence: 2, source: "user" },
    ] }), billingMethod: "Per Hour" }).reasonCode).toBe("REJECTED");
    expect(evaluateDeurBillingEligibility({ deur: buildDeur({ billingLocked: true, billingStatementId: "statement-1" }), billingMethod: "Per Hour" }).reasonCode).toBe("BILLING_LOCKED");
  });

  it("reports invalid and open event states before billable-evidence evaluation", () => {
    const base = buildDeur();
    const openMeal = buildDeur({ events: [
      ...(base.events ?? []).slice(0, 3),
      { id: "meal", activityType: "mealBreak", action: "start", timestamp: "2026-01-01T02:10:00.000Z", sequence: 4, source: "user" },
      { id: "end", activityType: "shift", action: "end", timestamp: "2026-01-01T03:00:00.000Z", sequence: 5, source: "user" },
    ] });
    expect(evaluateDeurBillingEligibility({ deur: openMeal, billingMethod: "Per Hour" }).reasonCode).toBe("OPEN_ACTIVITY");
    const malformed = buildDeur({ events: [
      { id: "s1", activityType: "shift", action: "start", timestamp: "2026-01-01T00:00:00.000Z", sequence: 1, source: "user" },
      { id: "s2", activityType: "shift", action: "start", timestamp: "2026-01-01T00:00:00.000Z", sequence: 2, source: "user" },
      { id: "e", activityType: "shift", action: "end", timestamp: "2026-01-01T01:00:00.000Z", sequence: 3, source: "user" },
    ] });
    expect(evaluateDeurBillingEligibility({ deur: malformed, billingMethod: "Per Hour" }).reasonCode).toBe("INVALID_EVENT_HISTORY");
  });

  it("requires acknowledgement for every persisted non-ready review status", () => {
    (["Draft", "In Progress", "Submitted"] as const).forEach((status) => {
      expect(evaluateDeurBillingEligibility({ deur: buildDeur({ status }), billingMethod: "Per Hour" }).eligible).toBe(false);
    });
    expect(evaluateDeurBillingEligibility({ deur: buildDeur({ status: "Billed" }), billingMethod: "Per Hour" }).reasonCode).toBe("ALREADY_BILLED");
    expect(evaluateDeurBillingEligibility({ deur: buildDeur(), billingMethod: "Per Hour" }).eligible).toBe(true);
  });

  it("uses operation or idle evidence for hourly billing and shift evidence for every supported duration method", () => {
    const idleOnly = buildDeur({ events: [
      { id: "s", activityType: "shift", action: "start", timestamp: "2026-01-01T00:00:00.000Z", sequence: 1, source: "user" },
      { id: "i1", activityType: "idle", action: "start", timestamp: "2026-01-01T01:00:00.000Z", sequence: 2, source: "user" },
      { id: "i2", activityType: "idle", action: "end", timestamp: "2026-01-01T02:00:00.000Z", sequence: 3, source: "user" },
      { id: "e", activityType: "shift", action: "end", timestamp: "2026-01-01T03:00:00.000Z", sequence: 4, source: "user" },
    ] });
    expect(evaluateDeurBillingEligibility({ deur: idleOnly, billingMethod: "Per Hour" }).eligible).toBe(true);
    (["Per Day", "Per Week", "Per Month", "One Lot"] as const).forEach((billingMethod) => {
      expect(evaluateDeurBillingEligibility({ deur: buildDeur(), billingMethod }).eligible).toBe(true);
    });
  });

  it("does not treat meal breaks, unknown methods, or non-finite event values as supported billable evidence", () => {
    const mealOnly = buildDeur({ events: [
      { id: "s", activityType: "shift", action: "start", timestamp: "2026-01-01T00:00:00.000Z", sequence: 1, source: "user" },
      { id: "m1", activityType: "mealBreak", action: "start", timestamp: "2026-01-01T01:00:00.000Z", sequence: 2, source: "user" },
      { id: "m2", activityType: "mealBreak", action: "end", timestamp: "2026-01-01T02:00:00.000Z", sequence: 3, source: "user" },
      { id: "e", activityType: "shift", action: "end", timestamp: "2026-01-01T03:00:00.000Z", sequence: 4, source: "user" },
    ] });
    expect(evaluateDeurBillingEligibility({ deur: mealOnly, billingMethod: "Per Hour" }).reasonCode).toBe("NO_BILLABLE_ACTIVITY");
    expect(evaluateDeurBillingEligibility({ deur: buildDeur(), billingMethod: "Legacy Method" as never }).reasonCode).toBe("UNKNOWN_BILLING_METHOD");
    const invalidTimestamp = buildDeur({ events: [{ id: "bad", activityType: "shift", action: "start", timestamp: "not-a-date", sequence: 1, source: "user" }] });
    expect(evaluateDeurBillingEligibility({ deur: invalidTimestamp, billingMethod: "Per Hour" }).eligible).toBe(false);
  });

  it("does not let blank linkage fields block, but blocks any real consumption evidence", () => {
    expect(evaluateDeurBillingEligibility({ deur: buildDeur({ billId: " ", billingStatementId: "  ", billingLocked: false }), billingMethod: "Per Hour" }).eligible).toBe(true);
    expect(evaluateDeurBillingEligibility({ deur: buildDeur({ billId: "bill-1", billingStatementId: " " }), billingMethod: "Per Hour" }).reasonCode).toBe("ALREADY_BILLED");
  });

  it("returns detached finite evidence without monetary or payment fields on repeated evaluation", () => {
    const deur = buildDeur();
    const first = evaluateDeurBillingEligibility({ deur, billingMethod: "Per Hour" });
    const second = evaluateDeurBillingEligibility({ deur, billingMethod: "Per Hour" });
    expect(first).toEqual(second);
    expect(first.evidence?.totals).toBeDefined();
    expect(Object.values(first.evidence?.totals ?? {}).every(Number.isFinite)).toBe(true);
    expect(first.evidence).not.toHaveProperty("amount");
    expect(first.evidence).not.toHaveProperty("paymentStatus");
    if (first.evidence) first.evidence.totals.operationMinutes = 999;
    expect(deur.events?.[1].timestamp).toBe("2026-01-01T01:00:00.000Z");
    expect(() => JSON.stringify(first)).not.toThrow();
  });
});
