import { describe, expect, it } from "vitest";
import {
  BillingRateEngine,
  mapRentalContractToBillingCalculationTerms,
} from "@/features/rental/billing/engine";
import type { DeurRecord } from "@/features/rental/deur/types";
import type { BillingMethod, RentalContractRecord } from "@/features/rental/types/RentalContract";

function contract(method: BillingMethod = "Per Hour"): RentalContractRecord {
  return {
    id: "contract-1", contractNo: "C-001", customerId: "customer-1", equipmentId: "equipment-1", projectId: "project-1",
    rentalType: "Operated Rental", billingMethod: method, currency: "PHP", unitRate: 100,
    minimumBillableHours: 3, overtimeRate: 25, standbyRate: 20, mobilizationFee: 30, demobilizationFee: 40,
    fuelCharge: 50, operatorIncluded: false, operatorRate: 60, taxRate: 12, withholdingTax: 2, contractAmount: 700,
    startDate: "2026-01-01", expectedEndDate: "2026-01-31", status: "Active", createdAt: "2026-01-01", updatedAt: "2026-01-01",
  };
}

function deur(): DeurRecord {
  return {
    id: "deur-1", rentalId: "rental-1", equipmentId: "equipment-1", operatorId: "operator-1", workDate: "2026-01-02", logs: [],
    totalOperatingMinutes: 120, totalIdleMinutes: 60, totalStandbyMinutes: 60, totalMaintenanceMinutes: 0, totalMealBreakMinutes: 0,
    totalMobilizationMinutes: 0, totalDemobilizationMinutes: 0, status: "Acknowledged", legacy: false,
    createdAt: "2026-01-02", updatedAt: "2026-01-02",
  };
}

describe("BillingCalculationTerms", () => {
  it("maps every calculator field without Contract identity metadata or mutation", () => {
    const source = contract();
    const original = structuredClone(source);
    const terms = mapRentalContractToBillingCalculationTerms(source);

    expect(terms).toEqual({
      billingMethod: "Per Hour", unitRate: 100, minimumBillableHours: 3, overtimeRate: 25, standbyRate: 20,
      mobilizationFee: 30, demobilizationFee: 40, fuelCharge: 50, operatorIncluded: false, operatorRate: 60,
      taxRate: 12, withholdingTax: 2, contractAmount: 700,
    });
    expect(terms).not.toHaveProperty("id");
    expect(terms).not.toHaveProperty("contractNo");
    expect(source).toEqual(original);
    expect(JSON.parse(JSON.stringify(terms))).toEqual(terms);
  });

  it.each(["Per Hour", "Per Day", "Per Week", "Per Month", "Per Cubic Meter", "One Lot"] as const)(
    "preserves the legacy %s billing method exactly", (billingMethod) => {
      expect(mapRentalContractToBillingCalculationTerms(contract(billingMethod)).billingMethod).toBe(billingMethod);
    },
  );

  it("preserves Contract-driven calculation results for hourly charges, fees, taxes, and withholding", () => {
    const source = contract();
    const expected = {
      operatingHours: 3, idleHours: 1, standbyHours: 1, mobilizationHours: 0, demobilizationHours: 0,
      operatingCharge: 300, idleCharge: 20, standbyCharge: 20, mobilizationCharge: 30, demobilizationCharge: 40,
      operatorCharge: 60, fuelCharge: 50, subtotal: 520, vat: 62.4, withholdingTax: 10.4, grandTotal: 572,
    };

    expect(BillingRateEngine.calculate(deur(), mapRentalContractToBillingCalculationTerms(source))).toEqual(expected);
  });

  it("preserves One Lot contractAmount behavior", () => {
    expect(BillingRateEngine.calculate(deur(), mapRentalContractToBillingCalculationTerms(contract("One Lot"))).operatingCharge).toBe(700);
  });
});
