import { describe, expect, it } from "vitest";
import { BillingRateEngine, type BillingCalculationTerms } from "@/features/rental/billing/engine";
import { calculateDeurBillingStatementLine } from "@/features/rental/billingstatement/services/calculateDeurBillingStatementLine";
import { createDeurBillingPreview } from "@/features/rental/deur/billing/createDeurBillingPreview";
import { evaluateDeurBillingEligibility } from "@/features/rental/deur/billing/evaluateDeurBillingEligibility";
import type { DeurRecord } from "@/features/rental/deur/types";
import { billingStatementRepository } from "@/features/rental/billingstatement/repository";
import { storage } from "@/core/storage";

function odometerDeur(overrides: Partial<DeurRecord> = {}): DeurRecord {
  return {
    id: "deur-odometer", rentalId: "rental-1", equipmentId: "equipment-1", operatorId: "operator-1",
    workDate: "2026-02-27", reportDate: "2026-02-27", status: "Acknowledged", legacy: false,
    creationSource: "OPERATOR_DIGITAL", evidenceMode: "ODOMETER_TRIP", billingMethodSnapshot: "Per Kilometer",
    operationalMetadata: {
      costCode: { code: "5031HEAVYEQPT", name: "Heavy Equipment" },
      activityCode: { code: "LDC", name: "Loading" },
      workDescription: { name: "MATERIAL HAULING", requiresRemarks: false },
    },
    odometerTripEvidence: {
      checkpoints: [
        { id: "a", location: "Yard", odometerReading: 100, recordedAt: "2026-02-27T08:00:00.000Z" },
        { id: "b", location: "Site", odometerReading: 125, recordedAt: "2026-02-27T09:00:00.000Z" },
        { id: "c", location: "Dump", odometerReading: 170, recordedAt: "2026-02-27T10:00:00.000Z" },
      ],
      segments: [
        { id: "segment-a-b", startCheckpointId: "a", endCheckpointId: "b", startLocation: "Yard", endLocation: "Site", startOdometer: 100, endOdometer: 125, distance: 25 },
        { id: "segment-b-c", startCheckpointId: "b", endCheckpointId: "c", startLocation: "Site", endLocation: "Dump", startOdometer: 125, endOdometer: 170, distance: 45 },
      ], startingOdometer: 100, endingOdometer: 170, totalDistance: 70, tripCount: 2,
    },
    events: [], logs: [], totals: { shiftMinutes: 0, operationMinutes: 0, idleMinutes: 0, mealBreakMinutes: 0, breakdownMinutes: 0 },
    totalOperatingMinutes: 999, totalIdleMinutes: 999, totalMaintenanceMinutes: 999, totalMealBreakMinutes: 999,
    totalMobilizationMinutes: 0, totalDemobilizationMinutes: 0,
    createdAt: "2026-02-27T08:00:00.000Z", updatedAt: "2026-02-27T10:00:00.000Z", ...overrides,
  };
}

function terms(billingMethod: "Per Kilometer" | "Per Trip", unitRate: number): BillingCalculationTerms {
  return { billingMethod, unitRate, operatorIncluded: true, minimumBillableHours: 20, standbyRate: 500, overtimeRate: 900 };
}

describe("ODOMETER_TRIP billing eligibility", () => {
  it("accepts acknowledged canonical kilometer evidence with a positive rate", () => {
    expect(evaluateDeurBillingEligibility({ deur: odometerDeur(), billingMethod: "Per Kilometer", unitRate: 35 }))
      .toMatchObject({ eligible: true, reasonCode: "ELIGIBLE", evidence: { totalDistance: 70, tripCount: 2 } });
  });

  it.each([
    [{ status: "Draft" }, "NOT_ACKNOWLEDGED"],
    [{ status: "Submitted" }, "NOT_ACKNOWLEDGED"],
    [{ status: "Rejected" }, "REJECTED"],
    [{ billingLocked: true }, "BILLING_LOCKED"],
    [{ billingStatementId: "statement-1" }, "ALREADY_BILLED"],
    [{ evidenceMode: "TIME_TIMELINE" }, "EVIDENCE_MODE_MISMATCH"],
    [{ odometerTripEvidence: undefined }, "ODOMETER_EVIDENCE_NOT_CAPTURED"],
  ] as const)("rejects protected or incomplete kilometer evidence", (overrides, code) => {
    expect(evaluateDeurBillingEligibility({ deur: odometerDeur(overrides as Partial<DeurRecord>), billingMethod: "Per Kilometer", unitRate: 35 }).reasonCode).toBe(code);
  });

  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])("rejects invalid kilometer rates", (unitRate) => {
    expect(evaluateDeurBillingEligibility({ deur: odometerDeur(), billingMethod: "Per Kilometer", unitRate }).reasonCode).toBe("UNIT_RATE_INVALID");
  });

  it("rejects snapshot and derived evidence mismatches deterministically", () => {
    expect(evaluateDeurBillingEligibility({ deur: odometerDeur({ billingMethodSnapshot: "Per Trip" }), billingMethod: "Per Kilometer", unitRate: 35 }).reasonCode).toBe("BILLING_METHOD_SNAPSHOT_MISMATCH");
    const malformed = odometerDeur(); malformed.odometerTripEvidence = { ...malformed.odometerTripEvidence!, totalDistance: 71 };
    expect(evaluateDeurBillingEligibility({ deur: malformed, billingMethod: "Per Kilometer", unitRate: 35 }).reasonCode).toBe("ODOMETER_EVIDENCE_INVALID");
  });

  it("accepts trip evidence and requires a matching positive integer derived segment count", () => {
    const valid = odometerDeur({ billingMethodSnapshot: "Per Trip" });
    expect(evaluateDeurBillingEligibility({ deur: valid, billingMethod: "Per Trip", unitRate: 1500 })).toMatchObject({ eligible: true, evidence: { tripCount: 2 } });
    for (const tripCount of [0, -1, 1.5, 3, Number.NaN]) {
      const invalid = odometerDeur({ billingMethodSnapshot: "Per Trip" });
      invalid.odometerTripEvidence = { ...invalid.odometerTripEvidence!, tripCount };
      expect(evaluateDeurBillingEligibility({ deur: invalid, billingMethod: "Per Trip", unitRate: 1500 }).eligible).toBe(false);
    }
  });
});

describe("ODOMETER_TRIP billing calculation and mapping", () => {
  it("calculates 70 km x 35 without using time, ending odometer, minimums, idle, or overtime", () => {
    const deur = odometerDeur(); const before = structuredClone(deur);
    const result = BillingRateEngine.calculate(deur, terms("Per Kilometer", 35));
    expect(result).toMatchObject({ billingQuantity: 70, billingUnit: "KILOMETER", unitRate: 35, operatingCharge: 2450, idleCharge: 0, operatingHours: 0, idleHours: 0 });
    expect(deur).toEqual(before);
  });

  it("calculates trips from segment count and ignores distance and time", () => {
    const deur = odometerDeur({ billingMethodSnapshot: "Per Trip" });
    const result = BillingRateEngine.calculate(deur, terms("Per Trip", 1500));
    expect(result).toMatchObject({ billingQuantity: 2, billingUnit: "TRIP", unitRate: 1500, operatingCharge: 3000, operatingHours: 0, idleHours: 0 });
  });

  it("applies existing fees, VAT, and withholding once and stays serializable", () => {
    const configured = { ...terms("Per Kilometer", 35), mobilizationFee: 100, demobilizationFee: 50, fuelCharge: 25, operatorIncluded: false, operatorRate: 75, taxRate: 12, withholdingTax: 2 };
    const result = BillingRateEngine.calculate(odometerDeur(), configured);
    expect(result).toMatchObject({ operatingCharge: 2450, subtotal: 2700, vat: 324, withholdingTax: 54, grandTotal: 2970 });
    expect(() => JSON.stringify(result)).not.toThrow();
  });

  it("maps semantic quantity and immutable metadata without putting the date in Description", () => {
    const calculated = calculateDeurBillingStatementLine(odometerDeur(), terms("Per Kilometer", 35));
    expect(calculated).toMatchObject({ success: true, line: { workDate: "2026-02-27", description: "MATERIAL HAULING", costCode: "5031HEAVYEQPT", activityCode: "LDC", quantity: 70, unit: "km", unitRate: 35, amount: 2450 } });
    if (calculated.success) expect(calculated.line.description).not.toContain("02/27/2026");
  });

  it("exposes kilometer/trip quantity and rejects mismatched cubic-meter evidence", () => {
    expect(createDeurBillingPreview({ deur: odometerDeur(), terms: terms("Per Kilometer", 35) })).toMatchObject({ status: "available", quantity: { value: 70, unit: "km" }, charges: { operatingCharge: 2450 } });
    const cubic = createDeurBillingPreview({ deur: odometerDeur({ evidenceMode: "QUANTITY" }), terms: { billingMethod: "Per Cubic Meter", unitRate: 10, operatorIncluded: true } });
    expect(cubic).toMatchObject({ status: "ineligible", eligibility: { reasonCodes: ["COMMERCIAL_BILLING_METHOD_MISMATCH"] } }); expect(cubic.charges).toBeUndefined();
  });

  it.each([["Per Day", 250], ["Per Week", 250], ["Per Month", 250], ["One Lot", 900]] as const)("preserves %s", (billingMethod, amount) => {
    const configured: BillingCalculationTerms = { billingMethod, unitRate: 250, operatorIncluded: true, ...(billingMethod === "One Lot" ? { contractAmount: 900 } : {}) };
    expect(BillingRateEngine.calculate(odometerDeur(), configured).operatingCharge).toBe(amount);
  });
});

describe("generalized billing-line persistence", () => {
  it("round-trips kilometer/trip fields and keeps legacy hour lines loadable and detached", () => {
    storage.clear();
    billingStatementRepository.create({
      id: "statement-odometer", statementNo: "BS-ODO", version: 1, rentalId: "rental-1", equipmentId: "equipment-1", operatorId: "operator-1",
      customer: "Customer", project: "Project", billingFrom: "2026-02-27", billingTo: "2026-02-27", subtotal: 2450,
      approvalStatus: "Draft", invoiceStatus: "Not Invoiced", createdBy: "System", createdAt: "2026-02-27T10:00:00.000Z",
      lines: [{ id: "line-1", deurId: "deur-odometer", workDate: "2026-02-27", description: "MATERIAL HAULING", costCode: "5031HEAVYEQPT", activityCode: "LDC", hours: 0, hourlyRate: 35, quantity: 70, unit: "km", unitRate: 35, billingMethod: "Per Kilometer", amount: 2450 }],
    });
    const loaded = billingStatementRepository.getById("statement-odometer")!;
    expect(loaded.lines[0]).toMatchObject({ quantity: 70, unit: "km", unitRate: 35, billingMethod: "Per Kilometer", hours: 0 });
    loaded.lines[0].quantity = 999;
    expect(billingStatementRepository.getById("statement-odometer")!.lines[0].quantity).toBe(70);
    storage.set("equipment-rental-billing-statements", [{ ...loaded, id: "legacy", lines: [{ deurId: "old", workDate: "2025-01-01", description: "Rental", costCode: "", hours: 2, hourlyRate: 100, amount: 200 }] }]);
    expect(billingStatementRepository.getById("legacy")?.lines[0]).toMatchObject({ hours: 2, hourlyRate: 100 });
    storage.clear();
  });
});
