import { describe, expect, it } from "vitest";
import {
  isRentalBillingMethod,
  isRentalType,
  rentalBillingMethods,
  rentalTypes,
} from "@/features/rental/types";
import { getRentalCommercialTermsError } from "@/features/rental/services/RentalWorkflowRules";

describe("rental commercial terms", () => {
  it("offers only the approved rental classifications", () => {
    expect(rentalTypes).toEqual(["Bare Rental", "Operated Rental"]);
    expect(rentalTypes.every(isRentalType)).toBe(true);
  });

  it("accepts each approved billing method without free-text values", () => {
    expect(rentalBillingMethods).toEqual([
      "Per Hour", "Per Day", "Per Week", "Per Trip", "Per Kilometer", "Per Cubic Meter", "Per Lot",
    ]);
    expect(rentalBillingMethods.every(isRentalBillingMethod)).toBe(true);
    for (const billingMethod of rentalBillingMethods) {
      expect(getRentalCommercialTermsError({
        rentalType: "Operated Rental",
        billingMethod,
      })).toBeUndefined();
    }
    expect(isRentalBillingMethod("Hourly")).toBe(false);
  });

  it("requires valid terms for new rentals while allowing historical records to remain readable", () => {
    expect(getRentalCommercialTermsError({ rentalType: "", billingMethod: "Per Hour" })).toContain("rental type");
    expect(getRentalCommercialTermsError({ rentalType: "Bare Rental", billingMethod: "" })).toContain("billing method");
    expect(getRentalCommercialTermsError({ rentalType: "Operated Rental", billingMethod: "Per Hour" })).toBeUndefined();
    expect(isRentalType(undefined)).toBe(false);
    expect(isRentalBillingMethod(undefined)).toBe(false);
  });
});
