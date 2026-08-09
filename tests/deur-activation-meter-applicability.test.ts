import { beforeEach, describe, expect, it, vi } from "vitest";
import { storage } from "@/core/storage";
import { getDeurMeterRequirement } from "@/features/rental/deur/services/getDeurMeterRequirement";
import { getDeurStartEligibility } from "@/features/rental/deur/services/DeurValidationService";

describe("DEUR activation and meter applicability", () => {
  beforeEach(() => {
    storage.clear();
    vi.restoreAllMocks();
  });

  it.each(["Draft", "Assigned", "Reserved", "Released", "Closed", "Cancelled"] as const)(
    "denies DEUR start while the Rental is %s",
    (status) => {
      expect(getDeurStartEligibility({ status })).toEqual({
        eligible: false,
        message: `Rental must be Active before creating or starting a DEUR. Current status: ${status}.`,
      });
    },
  );

  it("keeps Returned DEUR creation locked with controlled-recovery guidance", () => {
    const result = getDeurStartEligibility({ status: "Returned" });
    expect(result).toMatchObject({ eligible: false });
    if (!result.eligible) expect(result.message).toContain("Normal DEUR creation is locked");
  });

  it("allows DEUR start after activation", () => {
    expect(getDeurStartEligibility({ status: "Active" })).toEqual({ eligible: true });
  });

  it("does not write a DEUR when a Released Rental is denied", async () => {
    const [{ createDeur }, { deurRepository }] = await Promise.all([
      import("@/features/rental/deur/services/CreateDeurService"),
      import("@/features/rental/deur/repository/deurRepository"),
    ]);
    const write = vi.spyOn(deurRepository, "create");

    const result = createDeur({
      rentalId: "rental-released",
      rentalStatus: "Released",
      equipmentId: "equipment-1",
      operatorId: "operator-1",
    });

    expect(result).toEqual({
      success: false,
      message: "Rental must be Active before creating or starting a DEUR. Current status: Released.",
    });
    expect(write).not.toHaveBeenCalled();
  });

  it.each([
    ["Per Hour", "none"],
    ["Per Day", "none"],
    ["Per Week", "none"],
    ["Per Month", "none"],
    ["Per Kilometer", "odometer"],
  ] as const)("maps %s billing to %s meter evidence", (billingMethod, kind) => {
    expect(getDeurMeterRequirement({ billingMethod })).toMatchObject({ kind });
  });

  it.each(["Per Trip", "One Lot"] as const)(
    "requires no meter for %s without an explicit commercial term",
    (billingMethod) => {
      expect(getDeurMeterRequirement({ billingMethod })).toMatchObject({
        kind: "none",
        source: "not-required",
      });
    },
  );

  it("honors explicit meter evidence for trip and lump-sum commercial terms", () => {
    expect(getDeurMeterRequirement({
      billingMethod: "Per Trip",
      commercialTerms: {
        billingMethod: "Per Trip",
        meterEvidenceRequirement: "odometer",
      },
    })).toMatchObject({ kind: "odometer", source: "explicit-commercial-term" });
    expect(getDeurMeterRequirement({
      billingMethod: "One Lot",
      commercialTerms: {
        billingMethod: "One Lot",
        meterEvidenceRequirement: "hourMeter",
      },
    })).toMatchObject({ kind: "hourMeter", source: "explicit-commercial-term" });
  });

  it("does not turn equipment maintenance tracking into a billing requirement", () => {
    expect(getDeurMeterRequirement({
      billingMethod: "Per Hour",
      equipmentMeterCapability: "hourMeter",
    })).toMatchObject({ kind: "none" });
  });
});
