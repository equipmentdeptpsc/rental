import { describe, expect, it } from "vitest";

import { resolveRentalReturnBusinessDate } from "@/features/rental/services/resolveRentalReturnBusinessDate";
import type { RentalRecord } from "@/features/rental/types";

const rental = { id: "rental", equipmentId: "equipment", operatorId: "operator", customer: "Customer", project: "Project", rentedBy: "Admin", dateOut: "2026-10-01", statusId: "active", status: "Active", deurExpectationPolicy: { frequency: "PER_WORKDAY", effectiveFrom: "2026-10-01", timezone: "Asia/Manila", capturedAt: "2026-10-01T00:00:00.000Z" } } as RentalRecord;

describe("Rental automatic Return business date", () => {
  it("uses the Rental timezone instead of the UTC date at rollover", () => {
    const result = resolveRentalReturnBusinessDate(rental, new Date("2026-10-03T18:00:00.000Z"));
    expect(result).toMatchObject({ timezone: "Asia/Manila", value: "2026-10-04", label: "October 4, 2026" });
  });

  it("uses the tenant default timezone when a legacy Rental has no frozen timezone", () => {
    expect(resolveRentalReturnBusinessDate({ ...rental, deurExpectationPolicy: undefined }, new Date("2026-10-03T18:00:00.000Z"))?.value).toBe("2026-10-04");
  });

  it("fails closed for an invalid explicit timezone or a date before Rental start", () => {
    expect(resolveRentalReturnBusinessDate({ ...rental, deurExpectationPolicy: { ...rental.deurExpectationPolicy!, timezone: "Invalid/Timezone" } }, new Date("2026-10-03T18:00:00.000Z"))).toBeUndefined();
    expect(resolveRentalReturnBusinessDate({ ...rental, dateOut: "2026-10-05" }, new Date("2026-10-03T18:00:00.000Z"))).toBeUndefined();
  });
});
