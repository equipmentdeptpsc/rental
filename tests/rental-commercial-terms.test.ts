import { beforeEach, describe, expect, it } from "vitest";
import {
  isRentalBillingMethod,
  isRentalType,
  normalizeRentalBillingMethod,
  rentalBillingMethods,
  rentalTypes,
} from "@/features/rental/types";
import { getRentalCommercialTermsError } from "@/features/rental/services/RentalWorkflowRules";
import { storage } from "@/core/storage";
import { rentalContractRepository } from "@/features/rental/repository/rentalContractRepository";
import { normalizeRentalCommercialSnapshot } from "@/features/rental/services/createRentalCommercialSnapshot";

describe("rental commercial terms", () => {
  beforeEach(() => storage.clear());
  it("offers only the approved rental classifications", () => {
    expect(rentalTypes).toEqual(["Bare Rental", "Operated Rental"]);
    expect(rentalTypes.every(isRentalType)).toBe(true);
  });

  it("accepts each approved billing method without free-text values", () => {
    expect(rentalBillingMethods).toEqual([
      "Per Hour", "Per Day", "Per Week", "Per Month", "Per Trip", "Per Kilometer", "Per Cubic Meter", "One Lot",
    ]);
    expect(rentalBillingMethods.every(isRentalBillingMethod)).toBe(true);
    for (const billingMethod of rentalBillingMethods) {
      expect(getRentalCommercialTermsError({
        rentalType: "Operated Rental",
        billingMethod,
      })).toBeUndefined();
    }
    expect(isRentalBillingMethod("Hourly")).toBe(false);
    expect(rentalBillingMethods.filter((method) => method === "One Lot")).toHaveLength(1);
    expect(rentalBillingMethods).not.toContain("Per Lot");
  });

  it("normalizes legacy Per Lot contracts and snapshots to canonical One Lot on read and save", () => {
    const legacy = { id: "contract", rentalId: "rental", rentalEquipmentLineId: "line", contractNo: "C", customerId: "customer", equipmentId: "equipment", projectId: "project", rentalType: "Operated Rental", billingMethod: "Per Lot", currency: "PHP", unitRate: 100, contractAmount: 900, operatorIncluded: true, startDate: "2026-01-01", expectedEndDate: "2026-01-02", status: "Active", createdAt: "2026-01-01", updatedAt: "2026-01-01" };
    storage.set("equipment-rental-contracts", [legacy]);
    expect(rentalContractRepository.getById("contract")?.billingMethod).toBe("One Lot");
    rentalContractRepository.update({ ...rentalContractRepository.getById("contract")!, remarks: "saved" });
    expect(new Set(rentalContractRepository.getAll().map((item) => item.billingMethod))).toEqual(new Set(["One Lot"]));
    expect(normalizeRentalCommercialSnapshot({ billingMethod: "Per Lot", unitRate: 100, contractAmount: 900, operatorIncluded: true, currency: "PHP", capturedAt: "2026-01-01T00:00:00Z" })?.billingMethod).toBe("One Lot");
    expect(normalizeRentalBillingMethod("Per Lot")).toBe("One Lot");
  });

  it("requires a canonical rental type but defers billing method to line commercial terms", () => {
    expect(getRentalCommercialTermsError({ rentalType: "", billingMethod: "Per Hour" })).toContain("rental type");
    expect(getRentalCommercialTermsError({ rentalType: "Bare Rental", billingMethod: "" })).toBeUndefined();
    expect(getRentalCommercialTermsError({ rentalType: "Operated Rental" })).toBeUndefined();
    expect(getRentalCommercialTermsError({ rentalType: "Operated Rental", billingMethod: "Per Hour" })).toBeUndefined();
    expect(isRentalType(undefined)).toBe(false);
    expect(isRentalBillingMethod(undefined)).toBe(false);
  });
});
