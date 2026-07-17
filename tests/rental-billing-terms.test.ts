import { describe, expect, it } from "vitest";
import { normalizeRentalBillingTermsInput, validateRentalBillingTerms } from "@/features/rental/services/RentalWorkflowRules";

const base = { billingMethod: "Per Hour" as const, transactionRelationship: "Non-Affiliate" as const, billingTerms: { unitRate: 100, vatApplicability: "Applicable" as const } };
describe("rental billing terms", () => {
  it("accepts supported methods with a positive rate and discrete VAT", () => {
    for (const billingMethod of ["Per Hour", "Per Day", "Per Week"] as const) expect(validateRentalBillingTerms({ ...base, billingMethod }).valid).toBe(true);
  });
  it("rejects absent, zero, negative, and non-finite primary rates", () => {
    for (const unitRate of [undefined, 0, -1, Number.NaN, Infinity]) expect(validateRentalBillingTerms({ ...base, billingTerms: { ...base.billingTerms, unitRate } }).valid).toBe(false);
  });
  it("keeps unsupported methods optional and validates supplied terms", () => {
    expect(validateRentalBillingTerms({ billingMethod: "Per Trip" }).valid).toBe(true);
    expect(validateRentalBillingTerms({ ...base, billingMethod: "Per Trip", billingTerms: { ...base.billingTerms, fuelCharge: -1 } }).valid).toBe(false);
  });
  it("enforces affiliate VAT applicability separately from withholding", () => {
    expect(validateRentalBillingTerms({ ...base, transactionRelationship: "Affiliate", billingTerms: { unitRate: 1, vatApplicability: "Not Applicable", withholdingTax: 5 } }).valid).toBe(true);
    expect(validateRentalBillingTerms({ ...base, transactionRelationship: "Affiliate" }).valid).toBe(false);
    expect(validateRentalBillingTerms({ ...base, billingTerms: { ...base.billingTerms, withholdingTax: 101 } }).valid).toBe(false);
  });
  it("normalizes blank inputs without coercing them to zero and rejects invalid raw values", () => {
    expect(normalizeRentalBillingTermsInput({ billingTerms: { unitRate: " ", standbyRate: 0 } })).toMatchObject({ valid: true, value: { standbyRate: 0 } });
    expect(normalizeRentalBillingTermsInput({ billingTerms: { unitRate: "12.5" } })).toMatchObject({ valid: true, value: { unitRate: 12.5 } });
    expect(normalizeRentalBillingTermsInput({ billingTerms: { unitRate: "no" } }).valid).toBe(false);
    expect(normalizeRentalBillingTermsInput({ billingTerms: { unitRate: Infinity } }).valid).toBe(false);
    expect(normalizeRentalBillingTermsInput({ billingTerms: { vatApplicability: "taxable" } }).valid).toBe(false);
    expect(normalizeRentalBillingTermsInput({ transactionRelationship: "yes" }).valid).toBe(false);
  });
});
